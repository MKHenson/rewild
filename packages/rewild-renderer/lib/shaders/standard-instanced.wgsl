// Instanced metallic-roughness material — standard.wgsl's shading over a
// storage buffer of per-instance transforms, the way lambert-instanced.wgsl
// relates to lambert.wgsl.
//
// The entire fragment stage is shadeStandardSurface() from shader-lib, byte for
// byte the same code the per-mesh pass runs. Two differences from standard.wgsl,
// both structural rather than shading:
//
//   - the model-view and normal matrices come from `transforms[instanceIndex]`
//     rather than a per-mesh uniform, which frees group 0 for the material
//   - no selection tint: `uniforms.selected` is per mesh, and an instanced draw
//     has no per-instance equivalent to drive it. A scatter of a thousand ferns
//     is not something the editor selects one blade of.
#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/standard-material.wgsl"
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

struct VertexColorInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
  @location(3) color : vec4f,
}

// The material sits at group 0 here, where standard.wgsl has its per-mesh
// matrices — an instanced pass has no per-mesh group, and the shared shading
// code addresses these by name rather than by group index, so the layouts are
// free to differ.
@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var baseColorMap: texture_2d<f32>;
@group(0) @binding(2) var normalMap: texture_2d<f32>;
@group(0) @binding(3) var metallicRoughnessMap: texture_2d<f32>;
@group(0) @binding(4) var occlusionMap: texture_2d<f32>;
@group(0) @binding(5) var emissiveMap: texture_2d<f32>;
@group(0) @binding(6) var<uniform> standardParams: StandardParams;

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
// Sky IBL — same bindings as standard.wgsl, since both run the same fragment
// code out of shader-lib. See that file for why they share group 3.
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

fn transformVertex(
  instanceIndex: u32,
  position: vec3f,
  uv: vec2f,
  normal: vec3f,
  color: vec4f
) -> VertexOutput {
  var output : VertexOutput;

  let transform = transforms[instanceIndex];

  var mvPosition = vec4<f32>(position, 1.0);
  mvPosition = transform.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  output.normal = transform.normalMatrix * normal;
  output.color = color;
  return output;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, vec4f(1.0)
  );
}

@vertex
fn vsVertexColors(input: VertexColorInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, input.color
  );
}

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
  @location(2) viewPosition: vec3f,
  @location(3) vertexColor: vec4f,
  @builtin(front_facing) isFrontFacing: bool
) -> @location(0) vec4f {

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  var outColor = shadeStandardSurface(
    fragUV,
    normal,
    viewPosition,
    vertexColor,
    isFrontFacing,
    cloudShadowFactor * directionalShadowFactor,
    spotShadowFactor
  );

  if (directionalShadowParams.debugMode != 0u) {
    outColor = vec4f(mix(outColor.rgb, cascadeDebugTint, 0.5), outColor.a);
  }

  return outColor;
}
