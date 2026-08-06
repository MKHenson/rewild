// The metallic-roughness "standard" material — glTF's material model, and the
// one every other pass is heading toward.
//
// Structurally this is phong.wgsl with the shading swapped: same bind groups,
// same shadow and selection includes. What changes is that the shading is a
// *function call* into shader-lib rather than statements spliced into this
// body, which is what lets standard-instanced.wgsl reuse it verbatim — and what
// will let terrain reuse it later with per-fragment material parameters.
//
// Two vertex entry points, one fragment: `vs` for geometry without COLOR_0 and
// `vsVertexColors` for geometry with it. StandardPass picks one when it builds
// its pipeline.
#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/tbn.frag.wgsl"
#include "./shader-lib/ibl.wgsl"
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
// Sky IBL. These share group 3 with the shadow resources because WebGPU only
// guarantees four bind groups and 0–2 are taken by the object, the material and
// the light buffer. ShadowUniforms populates them, and only for the passes
// whose shader declares them — see its class comment.
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

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

  // Shadow factors first: these are statement fragments, so they have to be
  // spliced into an entry point rather than called, and shadeStandardSurface
  // takes their results as arguments.
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

  return applySelectionTint(outColor, 0.35f);
}
