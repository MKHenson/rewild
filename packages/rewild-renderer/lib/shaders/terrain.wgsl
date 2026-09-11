#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/material-debug.wgsl"
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
  // Multiplies the ARM map's roughness (G), as glTF's roughnessFactor does.
  // 1 ⇒ trust the map; below 1 polishes the material, above 1 dulls it.
  roughnessFactor : f32,
  // +1 for a DirectX-convention normal map, -1 for an OpenGL one. See
  // decodeNormal.
  normalYSign : f32,
  // Depth of the parallax-occlusion volume, in tile-UV units (one tile = 1.0).
  // 0 ⇒ this material samples flat, no parallax.
  heightScale : f32, 
  occlusionStrength : f32,
  // Width of this material's transition to its neighbours, in blend-score
  // units. Small ⇒ a hard interlocking edge where per-texel relief decides
  // every fragment; large ⇒ the splat weight carries a soft crossfade. Averaged
  // across the active layers by splat weight (see the combine), so it is this
  // material's *vote* on how the transition reads, not a unilateral answer.
  blendDepth  : f32,
  // Normal-array layer the macro normal samples. Usually the same as
  // layerIndex, but a material may borrow another material's normal map when
  // its own reads badly at metre scale — so this is indexed separately.
  macroLayerIndex : f32,
  // Green-channel sign of the *macro* map. Belongs to whichever material the
  // map came from, so it need not match normalYSign.
  macroNormalYSign: f32,
  // Macro-normal amplitude: 0 flat, 1 the source map's full tilt.
  macroStrength   : f32,
}

struct TerrainParams {
  // View distance over which the detail normal fades toward flat.
  detailFadeStart : f32,
  detailFadeEnd   : f32,
  // Size of the no-tile offset regions, as a fraction of a layer's own tile
  // (it multiplies scaledUV, not fragUV). Smaller ⇒ larger regions.
  noiseScale      : f32,
  // Height-blend transition width, in blend-score units. Only layers within this
  // of the winning score contribute: small ⇒ a hard interlocking silhouette
  // (just the tallest material shows), large ⇒ softens toward a plain crossfade.
  heightBlendDepth: f32,
  // Packed TerrainLayer, three vec4f per splat channel (SPLAT_SLOTS channels):
  //   [slot*3    ] = (layerIndex, uvScale, macroUvScale, roughnessFactor)
  //   [slot*3 + 1] = (normalYSign, heightScale, occlusionStrength, blendDepth)
  //   [slot*3 + 2] = (macroLayerIndex, macroNormalYSign, macroStrength, _pad)
  // vec4f rather than array<TerrainLayer, N> because a uniform array's element
  // stride must be a multiple of 16 — a vec4f guarantees that, whereas a struct
  // depends on alignment rules that are easy to get subtly wrong. The spare
  // lane in the third vec4 is where the next per-layer parameter goes.
  // Unpack through getLayer().
  layers          : array<vec4f, 24>,
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
@group(1) @binding(6) var<uniform> terrainParams: TerrainParams;
@group(1) @binding(7) var armArray: texture_2d_array<f32>;
@group(1) @binding(8) var heightArray: texture_2d_array<f32>;
// Palette channels 4-7. A second texture rather than more channels, because an
// RGBA8 texel holds four weights and that is the format the splat is authored
// and uploaded in; `splatMap` carries channels 0-3. Same dimensions, same
// sampler, same UV — the pair is one logical map.
@group(1) @binding(9) var splatMapExt: texture_2d<f32>;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;
// Sky IBL — the same bindings standard.wgsl declares, since terrain now runs
// the same shading. TerrainPass opts its ShadowUniforms into populating them.
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

// Splat weight below which a layer is skipped outright, saving its whole block
// of texture samples. One 8-bit quantisation step is 1/255 = 0.0039, so this is
// the smallest weight the splat can even express.
const WEIGHT_EPSILON: f32 = 0.004;

// Weight at which a layer earns its full say in the blend; between the epsilon
// and this it fades in.
//
// Without the fade the skip above is a *cliff*, and the height-aware combine
// makes that cliff enormous. Contribution is not proportional to weight: once a
// layer is active its score is weight + (height - 0.5), and the height term
// spans ±0.5 — far more than a small weight. So a layer carrying 0.4% of the
// splat still clears the cutoff wherever its relief is high and walks off with
// 20-40% of the fragment, and because it also joins blendWeightSum it drags
// every other layer's share down with it. Crossing 0.004 therefore jumped the
// blend discontinuously, and the contour where a smooth weight field crosses
// that threshold drew a hard-edged region across the terrain: a pale material
// with almost no business being there, veiling the ground inside its own
// iso-line. Fading from the epsilon means the faded-in and skipped cases meet at
// exactly zero, so the seam closes.
//
// Raise it if materials still bleed in where the splat barely places them; lower
// it if genuine transitions start to look thin.
const WEIGHT_FADE_END: f32 = 0.05;

// Parallax-occlusion march step counts. The count scales with view angle:
// MIN steps head-on (the ray barely moves across UV) up to MAX at grazing
// (where it sweeps far and would stair-step through thin ridges without them).
const POM_MIN_STEPS: f32 = 8.0;
const POM_MAX_STEPS: f32 = 16.0;

// Binary-search bisections that refine the bracketed crossing after the linear
// march (relief mapping). Each halves the depth error, so 6 turns the coarsest
// 8-step march into 8·2^6 = 512 effective depth levels — banding gone for six
// extra taps, far cheaper than a linear march fine enough to match.
const POM_REFINE_STEPS: i32 = 6;

// Grazing floor for the view ray's z (= N·V). The march travel is
// viewTS.xy / viewTS.z, which runs away as the surface turns edge-on: a screen
// pixel then covers a huge texture swath and adjacent pixels march to unrelated
// intersections — the grazing "heat-mirage" smear. Flooring z caps that travel
// uniformly. It trades away literal-correct parallax at extreme grazing (which
// smears anyway) for a stable, shallow offset there. Higher ⇒ less smear, but
// the relief flattens sooner as you tilt toward the horizon. This is the right
// lever for grazing smear: capping travel does not draw the N·V contour rings
// that fading depth by orientation does.
const POM_MIN_VIEW_Z: f32 = 0.6;

// Splat channels the palette can address, across the two splat textures. Must
// match MAX_SPLAT_LAYERS (Biomes.ts) and the `layers` array above (3 vec4f
// each). Raising it costs nothing per fragment beyond the extra weight compares:
// every channel below WEIGHT_EPSILON skips its whole sample block.
const SPLAT_SLOTS: u32 = 8u;

fn getLayer(slot: u32) -> TerrainLayer {
  let a = terrainParams.layers[slot * 3u];
  let b = terrainParams.layers[slot * 3u + 1u];
  let c = terrainParams.layers[slot * 3u + 2u];
  return TerrainLayer(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w, c.x, c.y, c.z);
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

// One tap of the layer's height, as *depth* into the volume: 1 at the top
// surface (the polygon), 0 at the deepest crevice. POM references the top and
// only ever carves inward — all a heightmap on a flat face can honestly show —
// so the ray starts at depth 0 and marches down until the surface rises to meet
// it. Grad-sampled so it stays valid in the weight-gated, non-uniform loop.
fn sampleDepth(uv: vec2f, arrayIndex: i32, ddx: vec2f, ddy: vec2f) -> f32 {
  return 1.0 - textureSampleGrad(
    heightArray, seamlessSampler, uv, arrayIndex, ddx, ddy
  ).r;
}

// Parallax occlusion mapping: march the view ray through the layer's height
// volume and return the UV where it first crosses the surface. Unlike the
// single-step offset it self-occludes — near relief hides far relief — which is
// what lets it hold at the grazing angles that make single-step swim.
//
// `viewTS` is the tangent-space surface→eye direction; `amplitude` is the
// volume's depth in this layer's tile UV (heightScale, already faded by
// distance). Called once per no-tile tap, so the marched depth tracks the
// texture region actually shown at this fragment.
//
// Returns vec3f: the displaced UV in .xy, and the surface *height* (1 = peak) at
// the hit in .z — a free byproduct of the march that the height-aware layer
// blend downstream needs, so it costs no extra tap.
fn parallaxOcclusion(
  startUV: vec2f,
  arrayIndex: i32,
  ddx: vec2f,
  ddy: vec2f,
  viewTS: vec3f,
  amplitude: f32
) -> vec3f {
  // Distant fragments (detailFade → 0) carry no relief — skip the whole march,
  // but still report the height at the undisplaced UV for the blend.
  if (amplitude < 1e-4) {
    let h = textureSampleGrad(
      heightArray, seamlessSampler, startUV, arrayIndex, ddx, ddy
    ).r;
    return vec3f(startUV, h);
  }

  // Floor the view ray's z well above 0. The march travel is viewTS.xy/viewZ,
  // which runs away as the surface turns edge-on; there a screen pixel covers a
  // huge swath of texture and adjacent pixels march to unrelated intersections —
  // the grazing "heat-mirage" smear. Flooring z caps that travel uniformly,
  // which tames the smear *without* modulating depth by orientation (that draws
  // N·V contour rings on curved grazing surfaces). The relief just eases toward
  // a shallow offset as the surface goes edge-on, which is invisible anyway.
  let viewZ = max(viewTS.z, POM_MIN_VIEW_Z);
  let numLayers = mix(POM_MAX_STEPS, POM_MIN_STEPS, clamp(viewZ, 0.0, 1.0));
  let layerDepth = 1.0 / numLayers;
  // Total UV the ray sweeps across the full depth of the volume, and the step.
  let deltaUV = (viewTS.xy / viewZ) * amplitude * layerDepth;

  var currentUV = startUV;
  var currentLayerDepth = 0.0;
  var currentDepth = sampleDepth(currentUV, arrayIndex, ddx, ddy);

  // Linear march down the ray until the sampled surface is above the ray depth.
  // This only *brackets* the crossing — the true intersection lies in the last
  // step, between prevUV (ray still above surface) and currentUV (ray now
  // below). The fixed MAX bound is a safety cap; the break fires after
  // `numLayers` steps, when currentLayerDepth reaches 1.0 ≥ any depth.
  for (var s = 0; s < i32(POM_MAX_STEPS); s++) {
    if (currentLayerDepth >= currentDepth) {
      break;
    }
    currentUV -= deltaUV;
    currentDepth = sampleDepth(currentUV, arrayIndex, ddx, ddy);
    currentLayerDepth += layerDepth;
  }

  // Binary-search the bracketed step for the intersection (relief mapping,
  // Policarpo 2005). Linear interpolation across the step assumes the surface is
  // a straight ramp between the two samples, which terraces on curved or steep
  // relief — the banding. Bisection instead re-samples the heightfield each
  // halving, converging on the real surface: POM_REFINE_STEPS doublings turn
  // numLayers depth bands into numLayers·2^REFINE, enough to erase them.
  var uvAbove = currentUV + deltaUV;              // ray above surface
  var uvBelow = currentUV;                        // ray below surface
  var depthAbove = currentLayerDepth - layerDepth;
  var depthBelow = currentLayerDepth;
  for (var b = 0; b < POM_REFINE_STEPS; b++) {
    let uvMid = 0.5 * (uvAbove + uvBelow);
    let depthMid = 0.5 * (depthAbove + depthBelow);
    if (depthMid >= sampleDepth(uvMid, arrayIndex, ddx, ddy)) {
      uvBelow = uvMid;
      depthBelow = depthMid;
    } else {
      uvAbove = uvMid;
      depthAbove = depthMid;
    }
  }
  // The bracket is tight after the bisections, so its midpoint is the hit UV and
  // its mid-depth converts back to a height (1 - depth) with no further tap.
  let uvHit = 0.5 * (uvAbove + uvBelow);
  let heightHit = 1.0 - 0.5 * (depthAbove + depthBelow);
  return vec3f(uvHit, heightHit);
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

  // Channels 0-3 and 4-7 of the palette, from the two splat textures.
  let weightsRawLo = textureSample(splatMap, splatSampler, fragUV);
  let weightsRawHi = textureSample(splatMapExt, splatSampler, fragUV);

  // Quantising to 8 bits costs up to 1/255 per channel, and the palette usually
  // uses fewer than SPLAT_SLOTS materials. Renormalise so the blend is always a
  // true weighted average. (Linear filtering preserves the sum, so this covers
  // it.) Both textures share the sum — the weights are one distribution split
  // across two texels, not two distributions.
  let weightSum = dot(weightsRawLo, vec4f(1.0)) + dot(weightsRawHi, vec4f(1.0));
  let invWeightSum = 1.0 / max(weightSum, 1e-4);
  let weightsLo = weightsRawLo * invWeightSum;
  let weightsHi = weightsRawHi * invWeightSum;

  // Detail is deleted by mipping at distance anyway — fade it out deliberately
  // so what remains is the macro normal rather than mip-averaged grey.
  let viewDistance = length(viewPosition);
  let detailFade = 1.0 - smoothstep(
    terrainParams.detailFadeStart,
    terrainParams.detailFadeEnd,
    viewDistance
  );

  // Stable tangent frame for the parallax march. Unlike an arbitrary mesh, the
  // terrain's UV is an affine map of world XZ — U runs along world +X, V along
  // world -Z (see MeshGenerator) — so its tangent frame is *known*, not
  // something to reconstruct from screen-space derivatives. Rebuilding it from
  // dpdx/dpdy (as perturbNormal does for shading) yields a slightly different,
  // non-orthonormal basis every frame; the march integrates that view-dependent
  // wobble into an apparent depth that shifts as the camera turns — the ground
  // undulating and swelling under rotation. Building it from the fixed UV axes
  // instead gives an orthonormal frame that only *rotates* with the camera, so a
  // point's relief stays put and rotation reads as honest motion parallax.
  //
  // viewTS is the surface→eye direction in that frame: the march walks its xy
  // across UV per unit depth (viewTS.xy / viewTS.z), taking more steps as z
  // shrinks toward grazing. detailFade fades the relief out with distance —
  // mipped to nothing by then, and the march would only alias.
  let parallaxN = normalize(normal);
  // World +X (the +U axis) carried into view space, then Gram-Schmidt'd into the
  // surface tangent plane so T ⟂ N. normalMatrix carries a direction correctly
  // for the rigid, uniformly-scaled chunk transform (normalize absorbs scale).
  let uAxisView = uniforms.normalMatrix * vec3f(1.0, 0.0, 0.0);
  var tRaw = uAxisView - parallaxN * dot(parallaxN, uAxisView);
  // Degenerate when the face points along world X (a chunk skirt): +X is then
  // parallel to N and the projection vanishes. Fall back to the +Z axis, which
  // cannot also be parallel to N. The frame is then rotated relative to UV, but
  // these faces are hidden edge skirts — this only has to stay finite, not exact.
  if (dot(tRaw, tRaw) < 1e-6) {
    let zAxisView = uniforms.normalMatrix * vec3f(0.0, 0.0, 1.0);
    tRaw = zAxisView - parallaxN * dot(parallaxN, zAxisView);
  }
  let parallaxT = normalize(tRaw);
  // +V runs along world -Z; cross(N, T) yields that direction and is orthonormal.
  let parallaxB = cross(parallaxN, parallaxT);
  // View-space eye is the origin, so the surface→eye direction is -viewPosition.
  // (Named distinctly from the lighting include's own `viewDir` below.)
  let parallaxViewDir = -normalize(viewPosition);
  let viewTS = vec3f(
    dot(parallaxViewDir, parallaxT),
    dot(parallaxViewDir, parallaxB),
    dot(parallaxViewDir, parallaxN)
  );

  // Per-layer results, combined *after* the loop by a height-aware blend rather
  // than a straight splat-weighted sum. Gathering first is what lets the blend
  // compare every active layer's surface height at once, so the taller material
  // wins locally — rock peaks poking through grass along their own silhouette —
  // instead of the two crossfading uniformly across the transition.
  var layerColors = array<vec3f, 8>();
  var layerNormals = array<vec3f, 8>();
  var layerRoughness = array<f32, 8>();
  var layerOcclusion = array<f32, 8>();
  var layerScores = array<f32, 8>();
  // 1 for a slot the splat selected, 0 otherwise. A separate flag rather than a
  // negative sentinel in layerScores, because the score below is *legitimately*
  // negative: it is weight + (height - 0.5), so a low-weight layer sitting in a
  // crevice scores down to -0.5. Testing `score < 0` for "inactive" therefore
  // culled real layers, and culled them abruptly along the score = 0 contour —
  // an edge of its own, on top of the blendDepth one.
  var layerActive = array<f32, 8>();
  // Ramp from the skip threshold to full participation; see WEIGHT_FADE_END.
  var layerWeightFade = array<f32, 8>();
  // Running splat-weighted mean of the active layers' blendDepths. See the
  // combine below for why the width cannot be taken from the winner alone.
  var blendDepthSum = 0.0;
  var blendDepthWeight = 0.0;
  var maxScore = -1e9;

  for (var layerSlot = 0u; layerSlot < SPLAT_SLOTS; layerSlot++) {
    // Slots 0-3 live in the first splat texture, 4-7 in the second.
    var weight = 0.0;
    if (layerSlot < 4u) {
      weight = weightsLo[layerSlot];
    } else {
      weight = weightsHi[layerSlot - 4u];
    }
    if (weight < WEIGHT_EPSILON) {
      continue;
    }

    layerWeightFade[layerSlot] = smoothstep(WEIGHT_EPSILON, WEIGHT_FADE_END, weight);

    let layer = getLayer(layerSlot);
    // Weighted by the splat rather than by the blend contribution: the
    // contribution depends on the cutoff, which depends on this average, so
    // that would be circular. The splat weight is also the honest measure of
    // "how much of this material is here", and it varies smoothly (bilinear
    // filtering), which is what keeps the resulting width free of creases.
    blendDepthSum += weight * layer.blendDepth;
    blendDepthWeight += weight;
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
    let noiseUV = scaledUV * terrainParams.noiseScale;
    let noiseDdx = ddx * terrainParams.noiseScale;
    let noiseDdy = ddy * terrainParams.noiseScale;
    let k = textureSampleGrad(
      noiseTexture, seamlessSampler, noiseUV, noiseDdx, noiseDdy
    ).x;
    let index = k * 8.0;
    let i = floor(index);
    let f = fract(index);
    let offa = sin(vec2f(3.0, 7.0) * (i + 0.0));
    let offb = sin(vec2f(3.0, 7.0) * (i + 1.0));

    // Parallax occlusion, applied *per no-tile tap*. The blend below relocates
    // the visible texture by offa/offb, so the relief actually shown is the
    // heightfield at those offset positions — marching a single ray at scaledUV
    // would displace each tap by relief that isn't its own, which warbles. So
    // each tap marches its own height volume; the blend then mixes two self-
    // consistent parallax samples. detailFade fades the volume depth to zero at
    // range, where the relief has mipped away and the march would only alias.
    let amplitude = layer.heightScale * detailFade;
    let resA = parallaxOcclusion(scaledUV + offa, arrayIndex, ddx, ddy, viewTS, amplitude);
    let resB = parallaxOcclusion(scaledUV + offb, arrayIndex, ddx, ddy, viewTS, amplitude);
    let sa = resA.xy;
    let sb = resB.xy;

    // Two offset lookups mixed by the region's fraction — the stochastic
    // no-tile blend that hides the repeat of a 1K texture over a 240m chunk.
    let cola = textureSampleGrad(albedoArray, seamlessSampler, sa, arrayIndex, ddx, ddy).rgb;
    let colb = textureSampleGrad(albedoArray, seamlessSampler, sb, arrayIndex, ddx, ddy).rgb;
    let blendFactor = smoothstep(0.2, 0.8, f - 0.1 * dot(cola - colb, vec3f(1.0, 1.0, 1.0)));

    // A plain lerp, deliberately. Averaging two uncorrelated crops does lose
    // variance (w0² + w1², so ~30% of the contrast at the 50/50 point), and
    // rescaling the deviation from the material's mean is the textbook
    // correction — but the correction factor is a smooth function of the region
    // fraction, so applying it paints the no-tile region structure onto the
    // ground as broad parallel bands. That trade is worse than the contrast it
    // buys back. If this is revisited, the fix for the banding is to make the
    // correction depend on something that is not the region field.
    let layerColor = mix(cola, colb, blendFactor);
    // The layer's surface height at this fragment, through the same no-tile blend
    // as its albedo so the height that arbitrates the splat tracks the texture
    // actually shown (the POM march returned it in .z for free).
    let layerHeight = mix(resA.z, resB.z, blendFactor);

    let nrmA = textureSampleGrad(normalArray, seamlessSampler, sa, arrayIndex, ddx, ddy).rgb;
    let nrmB = textureSampleGrad(normalArray, seamlessSampler, sb, arrayIndex, ddx, ddy).rgb;
    // Plain lerp for the same reason as the albedo above: rescaling the blended
    // tilt to recover the variance the average costs makes the shading track the
    // no-tile region field, which is far more visible than the slightly shallower
    // relief it corrects.
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
      // The macro normal is a normal map from this array at a much coarser UV.
      // Its features stay many pixels wide at range, so mipping cannot average
      // them away — which is what keeps distant mountains from reading flat.
      //
      // Usually it is this material's own map (macroLayerIndex == arrayIndex),
      // but a material whose detail normal reads badly stretched to metres can
      // borrow a coarser material's — same array, same single sample, so the
      // choice is free. Its ySign travels with the borrowed map, not this
      // material, or the macro relief inverts against the detail relief.
      let macroIndex = i32(layer.macroLayerIndex);
      let macroUV = fragUV * layer.macroUvScale;
      let macroDdx = duvdx * layer.macroUvScale;
      let macroDdy = duvdy * layer.macroUvScale;
      // Toward flat, before normalizing: macroStrength is an amplitude on the
      // map's tilt, and scaling a decoded normal's xy while z holds is exactly
      // that. Applied here so the crossfade below still interpolates a unit
      // normal, which is what bounds the tilt.
      let macroRaw = decodeNormal(
        textureSampleGrad(
          normalArray, seamlessSampler, macroUV, macroIndex, macroDdx, macroDdy
        ).rgb,
        layer.macroNormalYSign
      );
      let macroNormal = normalize(
        vec3f(macroRaw.xy * layer.macroStrength, macroRaw.z)
      );

      // Crossfade, not a sum: the macro *stands in for* the detail at range, so
      // it must be invisible up close where the detail it replaces still
      // resolves. Adding them instead leaves the macro at full strength at
      // every distance — a 240m-wide bump visible from arm's length.
      //
      // Interpolating two *unit* normals also bounds the tilt to between the
      // two. A UDN blend (macro.xy + detail.xy, macro.z) must not be used here:
      // both are full-strength rock-grade normal maps, so their xy sums toward
      // 2 while z stays put, tipping the normal into the tangent plane.
      // perturbNormal then points it sideways — into the hillside on a sheer
      // face — and the face renders black. normalize() bounds length, not tilt.
      layerNormal = normalize(mix(macroNormal, detailNormal, detailFade));
    }

    // The ARM map, sampled through the same no-tile blend as albedo so the
    // shading tracks the texture actually shown: occlusion in R, roughness in
    // G, metallic in B.
    //
    // Both channels finally mean what they say. Under Phong (before #202)
    // roughness could only scale the highlight's *strength*, not its lobe
    // width, and occlusion had no indirect term to attenuate at all — the map
    // carried both and the shader could use neither properly.
    //
    // B is still not read. Every natural material in the palette is a
    // dielectric, so metallic is pinned at 0 below rather than trusted from a
    // channel that is unauthored in most of these textures.
    let armA = textureSampleGrad(armArray, seamlessSampler, sa, arrayIndex, ddx, ddy);
    let armB = textureSampleGrad(armArray, seamlessSampler, sb, arrayIndex, ddx, ddy);
    let arm = mix(armA, armB, blendFactor);

    layerColors[layerSlot] = layerColor;
    layerNormals[layerSlot] = layerNormal;
    // glTF's roughnessFactor: the map is the detail, the material scalar is its
    // overall character. Clamped because a factor above 1 can push a already-
    // rough texel past the valid range.
    layerRoughness[layerSlot] = clamp(arm.g * layer.roughnessFactor, 0.0, 1.0);
    // glTF's occlusionTexture.strength, which lerps the map toward "unoccluded"
    // rather than scaling it — 0 ignores the map, 1 applies it in full.
    layerOcclusion[layerSlot] = 1.0 + layer.occlusionStrength * (arm.r - 1.0);
    // Height carves the boundary: a texel standing above its map's midpoint
    // (a rock bump) lifts the score, below it (a crevice) drops it, so the
    // taller layer shows through where it actually protrudes rather than by a
    // flat crossfade. Centred on 0.5 so an average-height texel neither gains nor
    // loses against its splat weight — the weight still sets where a material can
    // appear at all (a slot below WEIGHT_EPSILON was skipped and never scores),
    // and height only decides who wins in the overlap.
    let score = weight + (layerHeight - 0.5);
    layerScores[layerSlot] = score;
    layerActive[layerSlot] = 1.0;
    maxScore = max(maxScore, score);
  }

  // Height-aware combine (Mishkinis): only layers within blendDepth of the
  // winning score contribute, weighted by how far above the cutoff they stand.
  //
  // The score gap between two equally-weighted layers is their surface-height
  // difference, which spans roughly ±0.4 for typical maps — so a narrow depth
  // (~0.2) lets relief pick a single winner per texel, cutting the hard
  // interlocking silhouette rock wants, while a wide one (~0.7) leaves the splat
  // weight in charge and crossfades, which is what litter and sand want.
  //
  // The width is the splat-weighted *mean* of the active layers' depths, not the
  // winning layer's. Reading it from the winner alone looks equivalent — the
  // blended colour is even continuous across the point where the winner changes,
  // since equal scores give equal contributions whatever the depth — but its
  // slope is not. Where a hard material meets a soft one (mountain rock at 0.2
  // against forest litter at 0.7) the width flips in a single fragment and the
  // ramp rate jumps 3.5×, which draws a Mach band along the 50/50 contour: a
  // visible line following the biome border, with a washed-out four-material
  // average on the soft side of it and a crisp cut on the hard side. Averaging
  // makes the width vary as smoothly as the splat does, so a mismatched pair
  // meets at an intermediate width instead of across a seam — and a material
  // still gets its own answer wherever it is the only thing present.
  //
  // The ramp is smoothstepped rather than the raw linear `score - cutoff`. The
  // linear version corners where a layer's contribution reaches zero, and a
  // slope discontinuity in a colour ramp reads as a line for the same reason the
  // one above did. Smoothstep is C1 at both ends, so layers ease in and out.
  //
  // The winner sits at t = 1, so blendWeightSum is ≥ 1 whenever any layer is
  // active — the guard below only catches the all-skipped degenerate splat
  // (which then falls back to a flat geometric normal).
  let blendDepth = max(blendDepthSum / max(blendDepthWeight, 1e-4), 1e-4);
  let cutoff = maxScore - blendDepth;
  var blendedColor = vec3f(0.0);
  var blendedTangentNormal = vec3f(0.0);
  var blendedRoughness = 0.0;
  var blendedOcclusion = 0.0;
  var blendWeightSum = 0.0;
  for (var layerSlot = 0u; layerSlot < SPLAT_SLOTS; layerSlot++) {
    if (layerActive[layerSlot] == 0.0) {
      continue;
    }
    let t = clamp((layerScores[layerSlot] - cutoff) / blendDepth, 0.0, 1.0);
    // The weight fade is what closes the seam at the skip threshold; see
    // WEIGHT_FADE_END. It reaches 0 exactly where the skip begins.
    let contribution = t * t * (3.0 - 2.0 * t) * layerWeightFade[layerSlot];
    blendWeightSum += contribution;
    blendedColor += contribution * layerColors[layerSlot];
    blendedTangentNormal += contribution * layerNormals[layerSlot];
    blendedRoughness += contribution * layerRoughness[layerSlot];
    blendedOcclusion += contribution * layerOcclusion[layerSlot];
  }

  // Per-fragment roughness and occlusion, blended across the active materials
  // so damp rock can hold a tight highlight in the same fragment dry grass
  // stays matte. Roughness rather than a Phong exponent means the lobe actually
  // narrows now, instead of a fixed-width highlight merely brightening.
  //
  // Fallbacks are for the degenerate splat below: fully rough and unoccluded,
  // which reads as plain diffuse rather than as anything eye-catching.
  var shadingRoughness = 1.0;
  var shadingOcclusion = 1.0;
  if (blendWeightSum > 1e-6) {
    blendedColor /= blendWeightSum;
    blendedTangentNormal /= blendWeightSum;
    shadingRoughness = blendedRoughness / blendWeightSum;
    shadingOcclusion = blendedOcclusion / blendWeightSum;
  } else {
    // Every layer fell below the epsilon (a degenerate splat) — normalizing a
    // zero vector yields NaN, which propagates through the lighting and renders
    // black. Fall back to the geometric normal.
    blendedTangentNormal = vec3f(0.0, 0.0, 1.0);
  }

  // One TBN for every layer: perturbNormal derives its basis from screen-space
  // derivatives, and that basis is invariant under uniform UV scaling (the
  // scale cancels through the normalize). So the layers' tangent-space normals
  // are blended first and the basis is applied once.
  // Apply the blended tangent-space normal through the terrain's *stable*
  // orthonormal frame (parallaxT/B/N, built from the UV→world mapping up top)
  // rather than perturbNormal's screen-space derivative frame. That frame is
  // non-orthonormal and rebuilt from the view every frame, so it skews the
  // perturbed normal differently as the camera turns — invisible under the sun,
  // but a head-mounted light (L ≈ V) rides exactly that axis, so the flashlight
  // brightened and dimmed with heading. The UV frame is fixed to world XZ, so
  // the shading normal is view-consistent. (Same fix as the parallax undulation.)
  let ns = normalize(blendedTangentNormal);
  let normalizedNormal = normalize(
    parallaxT * ns.x + parallaxB * ns.y + parallaxN * ns.z
  );

  // Shadow factors are statement fragments, so they splice into the entry point
  // rather than being called. The shading itself is a function call now: the
  // Blinn-Phong include this replaced wrote six named locals into scope and
  // relied on them being assembled correctly below, whereas accumulatePbrLighting
  // takes a surface and returns its buckets.
  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  var surface: PbrSurface;
  surface.normal = normalizedNormal;
  surface.specularNormal = normalizedNormal;
  // parallaxN is the mesh normal before any map tilts it — the surface the
  // triangle actually has, which is what horizon occlusion needs.
  surface.geometricNormal = parallaxN;
  surface.viewPosition = viewPosition;
  // Metallic is pinned at 0: every material in the palette is a dielectric, so
  // the diffuse colour is the albedo and F0 is glTF's fixed 4%. If a metallic
  // terrain material ever exists, this is where the ARM map's B channel goes.
  surface.diffuseColor = diffuseColorFromBaseColor(blendedColor, 0.0);
  surface.f0 = f0FromBaseColor(blendedColor, 0.0);
  surface.alpha = perceptualRoughnessToAlpha(shadingRoughness);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );

  // Shadows attenuate diffuse and specular together — a blocked light delivers
  // neither. Same assembly as shadeStandardSurface, and deliberately so: the
  // two paths shade the same way or the objects standing on the terrain do not
  // look like they belong on it.
  let sunShadow = cloudShadowFactor * directionalShadowFactor;
  let direct = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
             + lit.punctualDiffuse + lit.punctualSpecular
             + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadowFactor;
  var shaded = direct;

  // Sky IBL in place of the flat ambient constant. Occlusion applies to this and
  // only this: direct light already answers the question with N·L and the shadow
  // maps, so multiplying it there would double-darken every crevice.
  let indirect = evaluateIbl(surface, shadingRoughness) * shadingOcclusion;
  shaded += indirect;

  // Channel visualisation
  if (iblParams.debugChannel != DEBUG_CHANNEL_OFF) {
    return materialDebugColor(
      blendedColor,
      // Pinned at 0 by this shader, so the channel reports the constant rather
      // than the ARM map's unauthored B.
      0.0,
      shadingRoughness,
      normalizedNormal,
      shadingOcclusion,
      vec3f(0.0), // terrain has no emissive slot
      direct,
      indirect
    );
  }

  // No multiply by albedo here, unlike the Phong path this replaced. The BRDF
  // already carries it — diffuseColor went into the surface, and specular is
  // tinted by F0 rather than by base colour.
  var color = vec4f(shaded, 1.0);
  if (directionalShadowParams.debugMode != 0u) {
    color = vec4f(mix(color.rgb, cascadeDebugTint, 0.5), 1.0);
  }
  return color;
}
