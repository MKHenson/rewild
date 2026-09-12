// Scatter instancing — standard.wgsl's shading over a persistent buffer of
// per-instance transforms.
//
// The fragment stage is shadeStandardSurface() from shader-lib, byte for byte
// what the per-mesh and instanced passes run. What differs is the vertex stage,
// and only because of where the transforms come from:
//
// standard-instanced.wgsl stores a model-view matrix per instance, which the
// CPU rebuilds every frame because it depends on the camera. A chunk of scatter
// holds thousands of instances that never move, so this stores a compact
// position/rotation/scale per instance — uploaded once when the chunk loads —
// and the camera arrives as a per-draw uniform instead. 48 bytes an instance
// against 112, and no per-frame upload.
//
// `modelViewMatrix` is the owning chunk's, so instance positions stay in the
// chunk-local space the mesh is already in. `nodeMatrix` is the primitive's
// place within its glTF model, applied before the instance transform.

const HAS_VERTEX_TANGENTS: bool = ${ HAS_VERTEX_TANGENTS };
const HAS_PARALLAX: bool = ${ HAS_PARALLAX };
const HAS_AUTHORED_NORMALS: bool = ${ HAS_AUTHORED_NORMALS };
const HAS_FACE_NORMAL_SPECULAR: bool = ${ HAS_FACE_NORMAL_SPECULAR };
const HAS_SPECULAR_OCCLUSION: bool = ${ HAS_SPECULAR_OCCLUSION };

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/parallax.frag.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/material-debug.wgsl"
#include "./shader-lib/standard-material.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"

struct Uniforms {
  projMatrix : mat4x4f,
  // The chunk's model-view. The only member that changes per frame.
  modelViewMatrix : mat4x4f,
  // The primitive's transform within its model, so a multi-part model keeps its
  // parts in place without a transformed copy of the geometry.
  nodeMatrix : mat4x4f,
  // x = metres at which this LOD tier hands over, y = metres at which it takes
  // over, z = the tier index, w = 1 to tint by tier for the LOD debug view.
  params : vec4f,
}

// One distinct colour per LOD tier for the debug tint, the far tiers warmest.
const TIER_TINTS = array<vec3f, 4>(
  vec3f(0.2, 1.0, 0.2),
  vec3f(1.0, 1.0, 0.2),
  vec3f(1.0, 0.5, 0.1),
  vec3f(1.0, 0.1, 0.1)
);

// Far enough outside the clip volume that every vertex of the triangle is
// discarded — z > w is behind the far plane.
const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

// 48 bytes: two vec4s plus a params slot the wind variant (#229) reads its
// phase out of.
struct ScatterInstance {
  // xyz chunk-local position, w uniform scale.
  posScale : vec4f,
  // Quaternion, xyzw.
  rotation : vec4f,
  // x = wind phase; y/z/w unused.
  params : vec4f,
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

struct VertexTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(4) tangent : vec4<f32>,
    @builtin(instance_index) instanceIndex: u32
};

struct VertexColorTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
    @location(4) tangent : vec4<f32>,
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

// Same layout as standard-instanced.wgsl: the material takes group 0, since an
// instanced pass has no per-mesh group to displace it.
@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var baseColorMap: texture_2d<f32>;
@group(0) @binding(2) var normalMap: texture_2d<f32>;
@group(0) @binding(3) var metallicRoughnessMap: texture_2d<f32>;
@group(0) @binding(4) var occlusionMap: texture_2d<f32>;
@group(0) @binding(5) var emissiveMap: texture_2d<f32>;
@group(0) @binding(6) var<uniform> standardParams: StandardParams;
@group(0) @binding(7) var heightMap: texture_2d<f32>;

@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<storage, read> instances : array<ScatterInstance>;

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

// The standard quaternion sandwich, which is cheaper than building a rotation
// matrix per vertex and is why the instance carries a quaternion at all.
fn rotateByQuat(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

fn transformVertex(
  instanceIndex: u32,
  position: vec3f,
  uv: vec2f,
  normal: vec3f,
  color: vec4f,
  tangent: vec4f
) -> VertexOutput {
  var output : VertexOutput;

  let instance = instances[instanceIndex];
  let node3 = mat3x3f(
    uniforms.nodeMatrix[0].xyz,
    uniforms.nodeMatrix[1].xyz,
    uniforms.nodeMatrix[2].xyz
  );

  let nodePosition = (uniforms.nodeMatrix * vec4f(position, 1.0)).xyz;
  let chunkPosition =
    instance.posScale.xyz +
    rotateByQuat(instance.rotation, nodePosition * instance.posScale.w);

  let mvPosition = uniforms.modelViewMatrix * vec4f(chunkPosition, 1.0);

  // Per instance, not per chunk. The chunk-level cull can only drop a whole
  // chunk at once, and a chunk is 480m across — so standing in one draws every
  // instance in it, out to the horizon. Collapsing the ones outside this
  // tier's band costs two compares and is also the whole of LOD selection:
  // every tier draws the same instances, and exactly one keeps each.
  let viewDistance = length(mvPosition.xyz);
  if (viewDistance < uniforms.params.y || viewDistance >= uniforms.params.x) {
    output.Position = CULLED_POSITION;
    return output;
  }

  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  output.color = color;

  // The instance scale is uniform and the model-view is rigid, so both drop out
  // of the normal under a normalize — no inverse-transpose is needed, which is
  // the whole reason the instance can be a compact TRS rather than a matrix.
  let modelView3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let worldNormal = rotateByQuat(instance.rotation, node3 * normal);
  output.normal = normalize(modelView3 * worldNormal);

  let worldTangent = rotateByQuat(instance.rotation, node3 * tangent.xyz);
  output.tangent = vec4f(modelView3 * worldTangent, tangent.w);

  return output;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, vec4f(1.0),
    NO_TANGENT
  );
}

@vertex
fn vsVertexColors(input: VertexColorInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, input.color,
    NO_TANGENT
  );
}

@vertex
fn vsTangents(input: VertexTangentInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, vec4f(1.0),
    input.tangent
  );
}

@vertex
fn vsVertexColorsTangents(input: VertexColorTangentInput) -> VertexOutput {
  return transformVertex(
    input.instanceIndex, input.position.xyz, input.uv, input.normal, input.color,
    input.tangent
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
) -> @location(0) vec4f {

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

  // Flat tier colour, lit only enough to keep the silhouette readable. A blend
  // over the shaded surface disappears under tone mapping.
  if (uniforms.params.w > 0.5) {
    let tier = min(u32(uniforms.params.z), 3u);
    let luma = dot(outColor.rgb, vec3f(0.299, 0.587, 0.114));
    outColor = vec4f(TIER_TINTS[tier] * (0.35 + 0.65 * min(luma, 1.0)), outColor.a);
  }

  return outColor;
}
