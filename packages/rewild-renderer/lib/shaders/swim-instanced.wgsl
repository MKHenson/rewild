// Swim instancing — standard.wgsl's shading over a batch of fish that bend in
// the vertex stage, with no skeleton.
//
// Each instance carries a place, a rotation and its wave: phase, amplitude and
// curve, the values the swim driver gives a bone fish. The body bends by the
// same rule as ChainLayer: at a point `s` along it, 0 at the nose and 1 at the
// tail tip, the spine points `amplitude × envelope(s) × sin(2πs / wavelength −
// phase) − curve × (s − pivot)` radians about model +Y. The spine is walked
// from the pivot to `s` in a few steps, so the body keeps its length as it
// bends, and each vertex turns with the spine where it lies.
//
// Model space: +Y up, +Z forward. `s` comes from the vertex's Z against the
// body's extent, so no spine weight is painted. COLOR_0.r, when bound, is a
// fin mask: masked vertices turn about the spine as well, so a tail fin swishes
// and a side fin flaps.

const HAS_VERTEX_TANGENTS: bool = ${ HAS_VERTEX_TANGENTS };
const HAS_PARALLAX: bool = ${ HAS_PARALLAX };
const HAS_AUTHORED_NORMALS: bool = ${ HAS_AUTHORED_NORMALS };
const HAS_FOLIAGE_SHADING: bool = ${ HAS_FOLIAGE_SHADING };
const HAS_FOLIAGE_NORMAL_MAP: bool = ${ HAS_FOLIAGE_NORMAL_MAP };
const HAS_FIN_MASK: bool = ${ HAS_FIN_MASK };

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
#include "./shader-lib/foliage-coverage.wgsl"
#include "./shader-lib/standard-material.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"

struct Uniforms {
  projMatrix : mat4x4f,
  // The batch's model-view.
  modelViewMatrix : mat4x4f,
  // The primitive's transform within its model.
  nodeMatrix : mat4x4f,
  // x = Z of the nose, y = body length, z = the pivot's place along the body,
  // w = wavelength in body lengths. Model space, after nodeMatrix.
  body : vec4f,
  // x = stiff, y = head, z = fin flutter in radians, w = fin beats per tail beat.
  shape : vec4f,
}

const TWO_PI = 6.28318530718;
// Steps the spine is walked in from the pivot to a vertex.
const BEND_STEPS = 6;

// 48 bytes.
struct SwimInstance {
  // xyz batch-local position, w uniform scale.
  posScale : vec4f,
  // Quaternion, xyzw.
  rotation : vec4f,
  // x = phase in radians, y = amplitude in radians, z = curve in radians,
  // w unused.
  wave : vec4f,
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

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var baseColorMap: texture_2d<f32>;
@group(0) @binding(2) var normalMap: texture_2d<f32>;
@group(0) @binding(3) var metallicRoughnessMap: texture_2d<f32>;
@group(0) @binding(4) var occlusionMap: texture_2d<f32>;
@group(0) @binding(5) var emissiveMap: texture_2d<f32>;
@group(0) @binding(6) var<uniform> standardParams: StandardParams;
@group(0) @binding(7) var heightMap: texture_2d<f32>;

@group(1) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<storage, read> instances : array<SwimInstance>;

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

// Radians about model +Y the spine points at `s`, as ChainLayer bends a chain.
fn spineAngle(s: f32, wave: vec4f) -> f32 {
  let stiff = uniforms.shape.x;
  let head = uniforms.shape.y;
  let e = max(0.0, (s - stiff) / max(1e-6, 1.0 - stiff));
  let envelope = head + (1.0 - head) * e * e;
  let k = TWO_PI / uniforms.body.w;
  return wave.y * envelope * sin(k * s - wave.x) - wave.z * (s - uniforms.body.z);
}

fn turnY(v: vec3f, c: f32, s: f32) -> vec3f {
  return vec3f(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

// About the body's long axis, by the fin flutter at `s`.
fn turnFin(v: vec3f, s: f32, mask: f32, wave: vec4f) -> vec3f {
  let angle = mask * uniforms.shape.z *
    sin(uniforms.shape.w * wave.x - TWO_PI * s / uniforms.body.w);
  let c = cos(angle);
  let n = sin(angle);
  return vec3f(v.x * c - v.y * n, v.x * n + v.y * c, v.z);
}

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
  let wave = instance.wave;
  let node3 = mat3x3f(
    uniforms.nodeMatrix[0].xyz,
    uniforms.nodeMatrix[1].xyz,
    uniforms.nodeMatrix[2].xyz
  );

  let nose = uniforms.body.x;
  let bodyLength = uniforms.body.y;
  let pivot = uniforms.body.z;

  let rest = (uniforms.nodeMatrix * vec4f(position, 1.0)).xyz;
  let s = clamp((nose - rest.z) / bodyLength, 0.0, 1.0);

  // The spine point at `s`, from the pivot, walked toward the tail.
  var spine = vec2f(0.0);
  let ds = (s - pivot) / f32(BEND_STEPS);
  for (var i = 0; i < BEND_STEPS; i++) {
    let a = spineAngle(pivot + (f32(i) + 0.5) * ds, wave);
    spine += vec2f(-sin(a), -cos(a)) * ds * bodyLength;
  }

  // Where the vertex sits off the spine: sideways, up, and along it past the
  // end of the body.
  var offset = vec3f(rest.x, rest.y, rest.z - (nose - s * bodyLength));
  var localNormal = node3 * normal;
  var localTangent = node3 * tangent.xyz;
  if (HAS_FIN_MASK) {
    offset = turnFin(offset, s, color.r, wave);
    localNormal = turnFin(localNormal, s, color.r, wave);
    localTangent = turnFin(localTangent, s, color.r, wave);
  }

  let angle = spineAngle(s, wave);
  let c = cos(angle);
  let n = sin(angle);
  let pivotZ = nose - pivot * bodyLength;
  let bent = vec3f(spine.x, 0.0, pivotZ + spine.y) + turnY(offset, c, n);

  let batchPosition =
    instance.posScale.xyz +
    rotateByQuat(instance.rotation, bent * instance.posScale.w);
  let mvPosition = uniforms.modelViewMatrix * vec4f(batchPosition, 1.0);

  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  // COLOR_0 is a fin mask or a tint, never both.
  output.color = select(color, vec4f(1.0), HAS_FIN_MASK);

  let modelView3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  let worldNormal = rotateByQuat(instance.rotation, turnY(localNormal, c, n));
  output.normal = normalize(modelView3 * worldNormal);

  let worldTangent = rotateByQuat(instance.rotation, turnY(localTangent, c, n));
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
  @builtin(front_facing) isFrontFacing: bool,
  @builtin(position) fragCoord: vec4f
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
