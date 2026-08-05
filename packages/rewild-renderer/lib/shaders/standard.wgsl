// The metallic-roughness "standard" material — glTF's material model, and the
// one every other pass is heading toward.
//
// Structurally this is phong.wgsl with the shading swapped: same bind groups,
// same shadow and selection includes. What changes is that the lighting loop is
// a *function call* into shader-lib/pbr-lighting.wgsl rather than a statement
// fragment spliced into this body, which is what lets terrain reuse it later
// with per-fragment material parameters.
//
// Two vertex entry points, one fragment: `vs` for geometry without COLOR_0 and
// `vsVertexColors` for geometry with it. StandardPass picks one when it builds
// its pipeline.
#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/selection-tint.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
  selected: f32,
}

// glTF alphaMode. Shared numbering with ALPHA_MODES in StandardMaterial.ts.
const ALPHA_MODE_OPAQUE: u32 = 0u;
const ALPHA_MODE_MASK  : u32 = 1u;
const ALPHA_MODE_BLEND : u32 = 2u;

struct StandardParams {
  // Multiplied by the corresponding texture channel, as glTF's *Factor
  // parameters are. A material with no map is the factor alone, because every
  // map defaults to white. The fourth component is the opacity factor.
  baseColorFactor  : vec4f,
  emissiveColor    : vec3f,
  roughness        : f32,
  // Flat ambient, and temporary: #201 replaces it with sky-captured IBL and
  // deletes it. It is here because without any ambient term a face turned away
  // from every light is pure black, which makes the BRDF impossible to judge.
  ambientColor     : vec3f,
  emissiveStrength : f32,
  metallic         : f32,
  occlusionStrength: f32,
  normalScale      : f32,
  alphaCutoff      : f32,
  alphaMode        : u32,
  _pad0            : f32,
  _pad1            : f32,
  _pad2            : f32,
}

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
};

// The vertex-coloured variant. glTF's COLOR_0 is optional, and a pipeline may
// only declare attributes its vertex buffers actually supply — so the two cases
// are two entry points over one shared body rather than one entry point reading
// a flag. The fragment stage is common to both: `vs` writes white, which is
// glTF's default COLOR_0 and a no-op through the same multiply.
struct VertexColorInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
  @location(3) color : vec4f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var mySampler: sampler;
@group(1) @binding(1) var baseColorMap: texture_2d<f32>;
@group(1) @binding(2) var normalMap: texture_2d<f32>;
// glTF keeps metallic-roughness and occlusion as two separate texture slots
// that are *allowed* to be the same image — which is what "ORM" is: occlusion
// in R, roughness in G, metallic in B. Modelling it as two slots rather than
// one packed slot is what lets a material use an ORM atlas, a separate AO map,
// or neither, without a mode flag. Pointing both at one texture costs a second
// fetch of an already-cached texel, which is not worth a branch to avoid.
@group(1) @binding(3) var metallicRoughnessMap: texture_2d<f32>;
@group(1) @binding(4) var occlusionMap: texture_2d<f32>;
@group(1) @binding(5) var emissiveMap: texture_2d<f32>;
@group(1) @binding(6) var<uniform> standardParams: StandardParams;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;

fn transformVertex(position: vec3f, uv: vec2f, normal: vec3f, color: vec4f) -> VertexOutput {
  var output : VertexOutput;
  var mvPosition = vec4<f32>(position, 1.0);
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  output.normal = uniforms.normalMatrix * normal;
  output.color = color;
  return output;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, vec4f(1.0));
}

@vertex
fn vsVertexColors(input: VertexColorInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, input.color);
}

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
  @location(2) viewPosition: vec3f,
  @location(3) vertexColor: vec4f,
  @builtin(front_facing) isFrontFacing: bool
) -> @location(0) vec4f {

  // baseColorMap is sRGB-declared (#190), so this sample is already linear.
  // Vertex colour is linear by glTF's definition and multiplies in unchanged.
  let baseColorSample = textureSample(baseColorMap, mySampler, fragUV)
                      * standardParams.baseColorFactor * vertexColor;
  let baseColor = baseColorSample.rgb;

  // Alpha is decided before any shading, so a masked-out fragment costs a
  // texture fetch rather than a light loop. `discard` demotes the invocation to
  // a helper, so the derivatives perturbNormal takes below are still defined
  // across the quad.
  if (standardParams.alphaMode == ALPHA_MODE_MASK && baseColorSample.a < standardParams.alphaCutoff) {
    discard;
  }

  // A back face is lit by the mirror of its normal — otherwise every leaf card
  // and every open shell is black from behind. Single-sided materials cull
  // their back faces, so this is a no-op for them rather than a branch worth
  // gating on doubleSided.
  let facing = select(-1.0, 1.0, isFrontFacing);
  let geometricNormal = normalize(normal) * facing;
  // glTF's normalTexture.scale, which tilts X and Y while leaving Z alone —
  // so it flattens or exaggerates the relief rather than rotating it. Applied
  // before perturbNormal, which renormalizes.
  let normalSample = (textureSample(normalMap, mySampler, fragUV).rgb * 2.0 - 1.0)
                   * vec3f(standardParams.normalScale, standardParams.normalScale, 1.0);

  // G is roughness and B is metallic, per glTF. A standalone grayscale
  // roughness map works in this slot too, since R = G = B in one.
  let metallicRoughnessSample = textureSample(metallicRoughnessMap, mySampler, fragUV);
  let roughness = standardParams.roughness * metallicRoughnessSample.g;
  let metallic = standardParams.metallic * metallicRoughnessSample.b;

  var surface: PbrSurface;
  surface.normal = perturbNormal(viewPosition, fragUV, geometricNormal, normalSample);
  surface.viewPosition = viewPosition;
  surface.diffuseColor = diffuseColorFromBaseColor(baseColor, metallic);
  surface.f0 = f0FromBaseColor(baseColor, metallic);
  surface.alpha = perceptualRoughnessToAlpha(roughness);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // Shadows attenuate diffuse and specular together — a blocked light delivers
  // neither.
  let sunShadow = cloudShadowFactor * directionalShadowFactor;
  var color = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
            + lit.punctualDiffuse + lit.punctualSpecular
            + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadowFactor;

  // Occlusion describes light that never reached the pocket in the first place,
  // which is a statement about *indirect* light — direct lighting already
  // answers the question with N·L and the shadow maps, and multiplying it again
  // here would double-darken every crevice that faces away from the sun. So
  // glTF scopes it to indirect, and today the only indirect term is the flat
  // ambient below. #201's IBL takes that term's place and inherits the multiply.
  //
  // Consequence worth knowing: with ambientColor at its default black, an
  // occlusion map has no visible effect at all.
  let occlusionSample = textureSample(occlusionMap, mySampler, fragUV).r;
  let occlusion = 1.0 + standardParams.occlusionStrength * (occlusionSample - 1.0);

  // Ambient lands on the diffuse colour only, so a metal stays black under it
  // rather than picking up a grey wash no reflection would produce.
  color += surface.diffuseColor * standardParams.ambientColor * occlusion;

  let emissiveSample = textureSample(emissiveMap, mySampler, fragUV).rgb;
  color += emissiveSample * standardParams.emissiveColor * standardParams.emissiveStrength;

  // OPAQUE ignores alpha entirely, and MASK has already resolved it to a yes or
  // no — both write 1.0, per glTF. Only BLEND lets it through, and only that
  // mode's pipeline has blending enabled to do anything with it.
  var alpha = 1.0;
  if (standardParams.alphaMode == ALPHA_MODE_BLEND) {
    alpha = baseColorSample.a;
  }

  var outColor = vec4f(color, alpha);

  if (directionalShadowParams.debugMode != 0u) {
    outColor = vec4f(mix(outColor.rgb, cascadeDebugTint, 0.5), outColor.a);
  }

  return applySelectionTint(outColor, 0.35f);
}
