#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"

struct Uniforms {
  projMatrix : mat4x4f,
}

struct Transform {
    modelViewMatrix : mat4x4<f32>,
    normalMatrix : mat3x3<f32>,
};

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
}

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

// Projection (binding 0) and instance transforms (binding 1) share group 1
// to leave group 2 for lighting and group 3 for shadow — WebGPU allows 4 groups max.
@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<storage, read> transforms : array<Transform>;

@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;

@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;

@vertex
fn vs(
  input: VertexInput
) -> VertexOutput {
  var output : VertexOutput;

  let transform = transforms[input.instanceIndex];
  let modelViewMatrix = transform.modelViewMatrix;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;

  output.normal = transform.normalMatrix * input.normal;

  output.fragUV = input.uv;
  return output;
}

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
  @location(2) viewPosition: vec3f
) -> @location(0) vec4f {
  let normalizedNormal = normalize(normal);

  #include "./shader-lib/total-lighting.frag.wgsl"
  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  let shadedLight = directionalLight * cloudShadowFactor * directionalShadowFactor
                  + otherLight
                  + shadowCastingSpotContrib * spotShadowFactor;

  var color = textureSample(myTexture, mySampler, fragUV) * vec4f(shadedLight, 1.0);
  if (directionalShadowParams.debugMode != 0u) {
    color = vec4f(mix(color.rgb, cascadeDebugTint, 0.5), 1.0);
  }
  return color;
}
