// The metallic-roughness "standard" material — glTF's material model, and the
// one every other pass is heading toward.
//
// Structurally this is phong.wgsl with the shading swapped: same vertex layout,
// same bind groups, same shadow and selection includes. What changes is that
// the lighting loop is a *function call* into shader-lib/pbr-lighting.wgsl
// rather than a statement fragment spliced into this body, which is what lets
// terrain reuse it later with per-fragment material parameters.
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

struct StandardParams {
  baseColorFactor  : vec3f,
  metallic         : f32,
  emissiveColor    : vec3f,
  roughness        : f32,
  // Flat ambient, and temporary: #201 replaces it with sky-captured IBL and
  // deletes it. It is here because without any ambient term a face turned away
  // from every light is pure black, which makes the BRDF impossible to judge.
  ambientColor     : vec3f,
  emissiveIntensity: f32,
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
@group(1) @binding(0) var mySampler: sampler;
@group(1) @binding(1) var baseColorMap: texture_2d<f32>;
@group(1) @binding(2) var normalMap: texture_2d<f32>;
@group(1) @binding(3) var emissiveMap: texture_2d<f32>;
@group(1) @binding(4) var<uniform> standardParams: StandardParams;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;

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

  let geometricNormal = normalize(normal);
  let normalSample = textureSample(normalMap, mySampler, fragUV).rgb * 2.0 - 1.0;

  // baseColorMap is sRGB-declared (#190), so this sample is already linear.
  let baseColorSample = textureSample(baseColorMap, mySampler, fragUV);
  let baseColor = baseColorSample.rgb * standardParams.baseColorFactor;

  var surface: PbrSurface;
  surface.normal = perturbNormal(viewPosition, fragUV, geometricNormal, normalSample);
  surface.viewPosition = viewPosition;
  surface.diffuseColor = diffuseColorFromBaseColor(baseColor, standardParams.metallic);
  surface.f0 = f0FromBaseColor(baseColor, standardParams.metallic);
  surface.alpha = perceptualRoughnessToAlpha(standardParams.roughness);

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

  // Ambient lands on the diffuse colour only, so a metal stays black under it
  // rather than picking up a grey wash no reflection would produce.
  color += surface.diffuseColor * standardParams.ambientColor;

  let emissiveSample = textureSample(emissiveMap, mySampler, fragUV).rgb;
  color += emissiveSample * standardParams.emissiveColor * standardParams.emissiveIntensity;

  var outColor = vec4f(color, baseColorSample.a);

  if (directionalShadowParams.debugMode != 0u) {
    outColor = vec4f(mix(outColor.rgb, cascadeDebugTint, 0.5), outColor.a);
  }

  return applySelectionTint(outColor, 0.35f);
}
