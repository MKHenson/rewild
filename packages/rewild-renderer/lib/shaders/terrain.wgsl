#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

// One material the splat map can select. `layerIndex` is the palette
// indirection: splat channel i weights the material in the texture arrays at
// layer getLayer(i).layerIndex. It is the identity today, and is what lets
// per-chunk palettes land later without touching this shader.
struct TerrainLayer {
  layerIndex  : f32,
  uvScale     : f32,
  // 0 ⇒ this material has no macro normal.
  macroUvScale: f32,
  specular    : f32,
  // +1 for a DirectX-convention normal map, -1 for an OpenGL one. See
  // decodeNormal.
  normalYSign : f32,
}

struct TerrainParams {
  specularColor   : vec3f,
  shininess       : f32,
  ambientColor    : vec3f,
  // View distance over which the detail normal fades toward flat.
  detailFadeStart : f32,
  detailFadeEnd   : f32,
  // Size of the no-tile offset regions, as a fraction of a layer's own tile
  // (it multiplies scaledUV, not fragUV). Smaller ⇒ larger regions.
  noiseScale      : f32,
  _pad            : vec2f,
  // Packed TerrainLayer, two vec4f per splat channel:
  //   [slot*2    ] = (layerIndex, uvScale, macroUvScale, specular)
  //   [slot*2 + 1] = (normalYSign, unused, unused, unused)
  // vec4f rather than array<TerrainLayer, N> because a uniform array's element
  // stride must be a multiple of 16 — a vec4f guarantees that, whereas a struct
  // depends on alignment rules that are easy to get subtly wrong. The spare
  // lanes in the second vec4 are where the next per-layer parameter goes.
  // Unpack through getLayer().
  layers          : array<vec4f, 8>,
}

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var splatSampler: sampler;
@group(1) @binding(1) var splatMap: texture_2d<f32>;
@group(1) @binding(2) var albedoArray: texture_2d_array<f32>;
@group(1) @binding(3) var seamlessSampler: sampler;
@group(1) @binding(4) var normalArray: texture_2d_array<f32>;
@group(1) @binding(5) var noiseTexture: texture_2d<f32>;
@group(1) @binding(6) var<uniform> phongParams: TerrainParams;
@group(1) @binding(7) var roughnessArray: texture_2d_array<f32>;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;

// Below this a layer contributes less than one 8-bit quantisation step, so its
// six texture samples would buy nothing.
const WEIGHT_EPSILON: f32 = 0.004;

fn getLayer(slot: u32) -> TerrainLayer {
  let a = phongParams.layers[slot * 2u];
  let b = phongParams.layers[slot * 2u + 1u];
  return TerrainLayer(a.x, a.y, a.z, a.w, b.x);
}

// Decodes a normal map sample from [0,1] to [-1,1] and resolves its green-
// channel convention.
//
// Our tangent frame's Y is dP/dv, and v runs *down* the image (WebGPU samples
// with the origin top-left; see MeshGenerator, where v grows as world -Z). A
// DirectX map encodes green the same way, so it needs no correction. An OpenGL
// map (Poly Haven, Blender) encodes green as *up* the image and must be
// inverted — otherwise its bumps light as though they were dents.
fn decodeNormal(sample: vec3f, ySign: f32) -> vec3f {
  let n = sample * 2.0 - 1.0;
  return vec3f(n.x, n.y * ySign, n.z);
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  var output : VertexOutput;
  var mvPosition = vec4<f32>(input.position.xyz, 1.0);
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = input.uv;
  output.normal = uniforms.normalMatrix * input.normal;
  return output;
}

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
  @location(2) viewPosition: vec3f
) -> @location(0) vec4f {
  // --- Uniform control flow: everything needing implicit derivatives ---------
  //
  // Below, layers are skipped by weight, which is non-uniform control flow —
  // where WGSL forbids textureSample and dpdx/dpdy. So every derivative and the
  // no-tile offsets are computed once, here, and the per-layer samples use
  // textureSampleGrad with explicit gradients.
  //
  // The gradients are of the *unscaled* UV; a layer scales them by its own
  // uvScale, which is exact because scaling UV by k scales its derivative by k.
  let duvdx = dpdx(fragUV);
  let duvdy = dpdy(fragUV);

  let weightsRaw = textureSample(splatMap, splatSampler, fragUV);

  // Quantising to 8 bits costs up to 1/255 per channel, and the palette may use
  // fewer than four materials. Renormalise so the blend is always a true
  // weighted average. (Linear filtering preserves the sum, so this covers it.)
  let weightSum = weightsRaw.r + weightsRaw.g + weightsRaw.b + weightsRaw.a;
  let weights = weightsRaw / max(weightSum, 1e-4);

  // Detail is deleted by mipping at distance anyway — fade it out deliberately
  // so what remains is the macro normal rather than mip-averaged grey.
  let viewDistance = length(viewPosition);
  let detailFade = 1.0 - smoothstep(
    phongParams.detailFadeStart,
    phongParams.detailFadeEnd,
    viewDistance
  );

  var blendedColor = vec3f(0.0);
  var blendedTangentNormal = vec3f(0.0);
  var specFactor = 0.0;

  for (var layerSlot = 0u; layerSlot < 4u; layerSlot++) {
    let weight = weights[layerSlot];
    if (weight < WEIGHT_EPSILON) {
      continue;
    }

    let layer = getLayer(layerSlot);
    let arrayIndex = i32(layer.layerIndex);
    let scaledUV = fragUV * layer.uvScale;
    let ddx = duvdx * layer.uvScale;
    let ddy = duvdy * layer.uvScale;

    // A smooth low-frequency field picks which of 8 offset pairs this region
    // uses. Two things about it are load-bearing:
    //
    // The field must be *smooth*. The index is a floor(), so a white-noise
    // source would change it every texel, chopping the surface into tiny
    // patches sampled from unrelated parts of the texture — a warbling mess.
    //
    // It is sampled off `scaledUV`, so its scale tracks the layer's tiling
    // rather than the world. A region has to stay large relative to one texture
    // tile: keyed to a fixed world size instead, a material with a big tile
    // (low uvScale) gets many offset changes inside a single tile and every one
    // of them is a visible seam. Scaling with the tile keeps the technique
    // correct from uvScale 1 to 25, and quietly turns it off (one region per
    // chunk) when the texture is so stretched there is no repeat to hide.
    let noiseUV = scaledUV * phongParams.noiseScale;
    let noiseDdx = ddx * phongParams.noiseScale;
    let noiseDdy = ddy * phongParams.noiseScale;
    let k = textureSampleGrad(
      noiseTexture, seamlessSampler, noiseUV, noiseDdx, noiseDdy
    ).x;
    let index = k * 8.0;
    let i = floor(index);
    let f = fract(index);
    let offa = sin(vec2f(3.0, 7.0) * (i + 0.0));
    let offb = sin(vec2f(3.0, 7.0) * (i + 1.0));

    // Two offset lookups mixed by the region's fraction — the stochastic
    // no-tile blend that hides the repeat of a 1K texture over a 240m chunk.
    let cola = textureSampleGrad(albedoArray, seamlessSampler, scaledUV + offa, arrayIndex, ddx, ddy).rgb;
    let colb = textureSampleGrad(albedoArray, seamlessSampler, scaledUV + offb, arrayIndex, ddx, ddy).rgb;
    let blendFactor = smoothstep(0.2, 0.8, f - 0.1 * dot(cola - colb, vec3f(1.0, 1.0, 1.0)));
    blendedColor += weight * mix(cola, colb, blendFactor);

    let nrmA = textureSampleGrad(normalArray, seamlessSampler, scaledUV + offa, arrayIndex, ddx, ddy).rgb;
    let nrmB = textureSampleGrad(normalArray, seamlessSampler, scaledUV + offb, arrayIndex, ddx, ddy).rgb;
    let detailNormal = normalize(
      decodeNormal(mix(nrmA, nrmB, blendFactor), layer.normalYSign)
    );

    // Materials with no macro normal keep their detail normal at every
    // distance, and let mipping LOD it. Fading them toward flat instead throws
    // the normal away early for nothing: a mip-averaged normal map is not mush,
    // it still carries the map's low-frequency shape, whereas a flat normal
    // means uniform full diffuse — which saturates a lit surface into a
    // featureless wash. The fade exists only to hand over to a macro normal.
    var layerNormal = detailNormal;

    if (layer.macroUvScale > 0.0) {
      // The macro normal is this material's own normal map at a much coarser
      // UV. Its features stay many pixels wide at range, so mipping cannot
      // average them away — which is what keeps distant mountains from reading
      // flat.
      let macroUV = fragUV * layer.macroUvScale;
      let macroDdx = duvdx * layer.macroUvScale;
      let macroDdy = duvdy * layer.macroUvScale;
      let macroNormal = normalize(decodeNormal(
        textureSampleGrad(
          normalArray, seamlessSampler, macroUV, arrayIndex, macroDdx, macroDdy
        ).rgb,
        layer.normalYSign
      ));

      // Crossfade, not a sum: the macro *stands in for* the detail at range, so
      // it must be invisible up close where the detail it replaces still
      // resolves. Adding them instead leaves the macro at full strength at
      // every distance — a 240m-wide bump visible from arm's length.
      //
      // Interpolating two *unit* normals also bounds the tilt to between the
      // two. A UDN blend (macro.xy + detail.xy, macro.z) must not be used here:
      // both maps are the same full-strength rock texture, so their xy sums
      // toward 2 while z stays put, tipping the normal into the tangent plane.
      // perturbNormal then points it sideways — into the hillside on a sheer
      // face — and the face renders black. normalize() bounds length, not tilt.
      layerNormal = normalize(mix(macroNormal, detailNormal, detailFade));
    }

    blendedTangentNormal += weight * layerNormal;

    // Roughness carves the specular highlight out of the material's surface,
    // instead of the whole layer glinting uniformly (the flat-scalar look:
    // wet plastic). This is a Phong hack, not PBR — roughness only scales the
    // highlight's *strength*, not the lobe width — but gloss = 1 - roughness is
    // enough to make dry grass matte and damp rock catch the sun. layer.specular
    // stays as the material's ceiling; roughness detail lives under it. Sampled
    // through the same no-tile blend as albedo so the highlight tracks the
    // texture actually shown.
    let rghA = textureSampleGrad(roughnessArray, seamlessSampler, scaledUV + offa, arrayIndex, ddx, ddy).r;
    let rghB = textureSampleGrad(roughnessArray, seamlessSampler, scaledUV + offb, arrayIndex, ddx, ddy).r;
    let roughness = mix(rghA, rghB, blendFactor);
    specFactor += weight * layer.specular * (1.0 - roughness);
  }

  // Every layer fell below the epsilon (a degenerate splat) — normalizing a
  // zero vector yields NaN, which propagates through the lighting and renders
  // black. Fall back to the geometric normal.
  if (dot(blendedTangentNormal, blendedTangentNormal) < 1e-8) {
    blendedTangentNormal = vec3f(0.0, 0.0, 1.0);
  }

  // One TBN for every layer: perturbNormal derives its basis from screen-space
  // derivatives, and that basis is invariant under uniform UV scaling (the
  // scale cancels through the normalize). So the layers' tangent-space normals
  // are blended first and the basis is applied once.
  let geometricNormal = normalize(normal);
  let normalizedNormal = perturbNormal(
    viewPosition, fragUV, geometricNormal, normalize(blendedTangentNormal)
  );

  #include "./shader-lib/total-lighting-phong.frag.wgsl"
  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  let diffuseShaded = directionalLight * cloudShadowFactor * directionalShadowFactor
                    + otherLight
                    + shadowCastingSpotContrib * spotShadowFactor;
  let specularShaded = (directionalSpecular * cloudShadowFactor * directionalShadowFactor
                    + otherSpecular
                    + shadowCastingSpotSpecular * spotShadowFactor) * specFactor;

  let shadedLight = diffuseShaded + specularShaded + phongParams.ambientColor;

  var color = vec4f(blendedColor, 1.0) * vec4f(shadedLight, 1.0);
  if (directionalShadowParams.debugMode != 0u) {
    color = vec4f(mix(color.rgb, cascadeDebugTint, 0.5), 1.0);
  }
  return color;
}
