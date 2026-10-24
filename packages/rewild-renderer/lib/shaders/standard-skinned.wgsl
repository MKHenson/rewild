// Skinned, instanced metallic-roughness material. The fragment stage is
// standard-instanced.wgsl's: shadeStandardSurface() from shader-lib.
//
// Each drawn SkinnedMesh has a world matrix and a pose slot in `instances`; the
// slot finds its joint matrices in `jointMatrices`. Normals and tangents go
// through the skinned model-view directly, which holds while skeleton and
// instance scales are uniform.

const HAS_VERTEX_TANGENTS: bool = ${ HAS_VERTEX_TANGENTS };
const HAS_PARALLAX: bool = ${ HAS_PARALLAX };
const HAS_AUTHORED_NORMALS: bool = ${ HAS_AUTHORED_NORMALS };
const HAS_FOLIAGE_SHADING: bool = ${ HAS_FOLIAGE_SHADING };
const HAS_FOLIAGE_NORMAL_MAP: bool = ${ HAS_FOLIAGE_NORMAL_MAP };

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/parallax.frag.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/scene-output.wgsl"
#include "./shader-lib/water-light.wgsl"
#include "./shader-lib/rain-wet.wgsl"
#include "./shader-lib/caustics.wgsl"
#include "./shader-lib/material-debug.wgsl"
#include "./shader-lib/foliage-lighting.wgsl"
#include "./shader-lib/standard-material.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"
#include "./shader-lib/skinning.wgsl"

struct Uniforms {
  projMatrix : mat4x4f,
  viewMatrix : mat4x4f,
  // x = joints per pose.
  params : vec4f,
}

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(5) joints : vec4<u32>,
    @location(6) weights : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexColorInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
    @location(5) joints : vec4<u32>,
    @location(6) weights : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(4) tangent : vec4<f32>,
    @location(5) joints : vec4<u32>,
    @location(6) weights : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexColorTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
    @location(4) tangent : vec4<f32>,
    @location(5) joints : vec4<u32>,
    @location(6) weights : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
  @location(3) color : vec4f,
  @location(4) tangent : vec4f,
}

const NO_TANGENT = vec4f(1.0, 0.0, 0.0, 0.0);

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var baseColorMap: texture_2d<f32>;
@group(0) @binding(2) var normalMap: texture_2d<f32>;
@group(0) @binding(3) var metallicRoughnessMap: texture_2d<f32>;
@group(0) @binding(4) var occlusionMap: texture_2d<f32>;
@group(0) @binding(5) var emissiveMap: texture_2d<f32>;
@group(0) @binding(6) var<uniform> standardParams: StandardParams;
@group(0) @binding(7) var heightMap: texture_2d<f32>;

@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<storage, read> instances : array<SkinnedInstance>;
@group(1) @binding(2) var<storage, read> jointMatrices : array<mat4x4f>;

@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;

@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;
@group(3) @binding(12) var causticsMap: texture_2d<f32>;
@group(3) @binding(13) var causticsSampler: sampler;
@group(3) @binding(14) var<uniform> caustics: CausticsParams;
@group(3) @binding(15) var waterLevelMap: texture_2d<f32>;
@group(3) @binding(16) var waterOpticsMap: texture_2d<f32>;

fn transformVertex(
  instanceIndex: u32,
  position: vec3f,
  uv: vec2f,
  normal: vec3f,
  color: vec4f,
  tangent: vec4f,
  joints: vec4u,
  weights: vec4f
) -> VertexOutput {
  var output : VertexOutput;

  let instance = instances[instanceIndex];
  let skin = skinMatrix(instance.slot, u32(uniforms.params.x), joints, weights);
  let modelView = uniforms.viewMatrix * instance.world * skin;
  let modelView3 = mat3x3f(modelView[0].xyz, modelView[1].xyz, modelView[2].xyz);

  let mvPosition = modelView * vec4f(position, 1.0);
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  output.normal = modelView3 * normal;
  output.color = color;
  output.tangent = vec4f(modelView3 * tangent.xyz, tangent.w);
  return output;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, vec4f(1.0),
    NO_TANGENT, input.joints, input.weights
  );
}

@vertex
fn vsVertexColors(input: VertexColorInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, input.color,
    NO_TANGENT, input.joints, input.weights
  );
}

@vertex
fn vsTangents(input: VertexTangentInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, vec4f(1.0),
    input.tangent, input.joints, input.weights
  );
}

@vertex
fn vsVertexColorsTangents(input: VertexColorTangentInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, input.color,
    input.tangent, input.joints, input.weights
  );
}

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
  @location(2) viewPosition: vec3f,
  @location(3) vertexColor: vec4f,
  @location(4) tangent: vec4f,
  @builtin(front_facing) isFrontFacing: bool
) -> SceneFragment {

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  var outColor = shadeStandardSurface(
    fragUV,
    normal,
    tangent,
    viewPosition,
    vertexColor,
    isFrontFacing,
    cloudShadowFactor * directionalShadowFactor,
    spotShadowFactor
  );

  if (directionalShadowParams.debugMode != 0u) {
    outColor = vec4f(mix(outColor.rgb, cascadeDebugTint, 0.5), outColor.a);
  }

  return sceneFragment(outColor);
}
