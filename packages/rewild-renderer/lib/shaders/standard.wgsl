// The metallic-roughness "standard" material — glTF's material model, and the
// one every other pass is heading toward.
//
// Structurally this is phong.wgsl with the shading swapped: same bind groups,
// same shadow and selection includes. What changes is that the shading is a
// *function call* into shader-lib rather than statements spliced into this
// body, which is what lets standard-instanced.wgsl reuse it verbatim — and what
// will let terrain reuse it later with per-fragment material parameters.
//
// Four vertex entry points, one fragment: COLOR_0 and TANGENT are both optional
// vertex attributes, and a pipeline may only declare attributes its buffers
// supply — so every combination of the two is an entry point over one shared
// body. StandardPass picks one when it builds its pipeline.

// Whether this pipeline's geometry supplies TANGENT, baked in by
// StandardPassBase.shaderDefines(). Declared before the includes because the
// shared shading below reads it to pick a tangent frame, and it has to be a
// constant rather than a uniform because one side of that branch takes
// derivatives — see standard-material.wgsl.
const HAS_VERTEX_TANGENTS: bool = ${ HAS_VERTEX_TANGENTS };

// Whether the parallax-occlusion march is compiled in, also from
// StandardPassBase.shaderDefines(). A const rather than a uniform because the
// march is a dozen dependent texture taps that a material without a height map
// should not pay for at all — and because it brackets a dpdx.
const HAS_PARALLAX: bool = ${ HAS_PARALLAX };
const HAS_AUTHORED_NORMALS: bool = ${ HAS_AUTHORED_NORMALS };

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/parallax.frag.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/material-debug.wgsl"
#include "./shader-lib/standard-material.wgsl"
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

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
};

struct VertexColorInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
};

struct VertexTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(4) tangent : vec4<f32>,
};

struct VertexColorTangentInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @location(3) color : vec4<f32>,
    @location(4) tangent : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
  @location(2) viewPosition : vec3f,
  @location(3) color : vec4f,
  @location(4) tangent : vec4f,
}

// What the entry points without a TANGENT attribute pass along. Never read:
// the fragment stage only looks at the tangent when HAS_VERTEX_TANGENTS, which
// is set only for the pipelines whose layout carries the attribute. A unit
// vector rather than zero so that a future reader of it gets a usable frame
// rather than a NaN.
const NO_TANGENT = vec4f(1.0, 0.0, 0.0, 0.0);

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
// Height in R, for the parallax march. Bound whether or not HAS_PARALLAX is
// set — the shared shading names it either way, so it stays in the derived bind
// group layout, and StandardMaterial defaults it to white, which is a flat
// surface at zero depth.
@group(1) @binding(7) var heightMap: texture_2d<f32>;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;
// Sky IBL. These share group 3 with the shadow resources because WebGPU only
// guarantees four bind groups and 0–2 are taken by the object, the material and
// the light buffer. ShadowUniforms populates them, and only for the passes
// whose shader declares them — see its class comment.
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

fn transformVertex(position: vec3f, uv: vec2f, normal: vec3f, color: vec4f, tangent: vec4f) -> VertexOutput {
  var output : VertexOutput;
  var mvPosition = vec4<f32>(position, 1.0);
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.viewPosition = mvPosition.xyz;
  output.fragUV = uv;
  output.normal = uniforms.normalMatrix * normal;
  output.color = color;
  // The model-view matrix, not the normal matrix: a tangent lies *along* the
  // surface, so it transforms like a difference of positions, where a normal is
  // a covector and needs the inverse transpose. The two agree under rotation
  // and uniform scale and diverge under a non-uniform one — glTF is explicit
  // that TANGENT follows the model matrix. The fragment stage re-orthogonalizes
  // the pair afterwards. Handedness is unitless and passes through.
  let modelView3 = mat3x3f(
    uniforms.modelViewMatrix[0].xyz,
    uniforms.modelViewMatrix[1].xyz,
    uniforms.modelViewMatrix[2].xyz
  );
  output.tangent = vec4f(modelView3 * tangent.xyz, tangent.w);
  return output;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, vec4f(1.0), NO_TANGENT);
}

@vertex
fn vsVertexColors(input: VertexColorInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, input.color, NO_TANGENT);
}

@vertex
fn vsTangents(input: VertexTangentInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, vec4f(1.0), input.tangent);
}

@vertex
fn vsVertexColorsTangents(input: VertexColorTangentInput) -> VertexOutput {
  return transformVertex(input.position.xyz, input.uv, input.normal, input.color, input.tangent);
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

  // Shadow factors first: these are statement fragments, so they have to be
  // spliced into an entry point rather than called, and shadeStandardSurface
  // takes their results as arguments.
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

  return applySelectionTint(outColor, 0.35f);
}
