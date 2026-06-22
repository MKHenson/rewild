#include "./shader-lib/total-lighting.wgsl"
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

struct PhongParams {
  specularColor    : vec3f,
  shininess        : f32,
  emissiveColor    : vec3f,
  emissiveIntensity: f32,
  ambientColor     : vec3f,
  _pad             : f32,
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
@group(1) @binding(1) var diffuseMap: texture_2d<f32>;
@group(1) @binding(2) var normalMap: texture_2d<f32>;
@group(1) @binding(3) var specularMap: texture_2d<f32>;
@group(1) @binding(4) var emissiveMap: texture_2d<f32>;
@group(1) @binding(5) var<uniform> phongParams: PhongParams;
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
  let normalizedNormal = perturbNormal(viewPosition, fragUV, geometricNormal, normalSample);

  #include "./shader-lib/total-lighting-phong.frag.wgsl"
  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  let specFactor = textureSample(specularMap, mySampler, fragUV).r;

  let diffuseShaded = directionalLight * cloudShadowFactor * directionalShadowFactor
                    + otherLight
                    + shadowCastingSpotContrib * spotShadowFactor;
  let specularShaded = (directionalSpecular * cloudShadowFactor * directionalShadowFactor
                    + otherSpecular
                    + shadowCastingSpotSpecular * spotShadowFactor) * specFactor;

  let shadedLight = diffuseShaded + specularShaded + phongParams.ambientColor;

  let albedo = textureSample(diffuseMap, mySampler, fragUV);
  let emissiveSample = textureSample(emissiveMap, mySampler, fragUV).rgb;
  let emissive = emissiveSample * phongParams.emissiveColor * phongParams.emissiveIntensity;

  var color = albedo * vec4f(shadedLight, 1.0) + vec4f(emissive, 0.0);
  color.a = albedo.a;

  if (directionalShadowParams.debugMode != 0u) {
    color = vec4f(mix(color.rgb, cascadeDebugTint, 0.5), color.a);
  }

  return applySelectionTint(color, 0.35f);
}
