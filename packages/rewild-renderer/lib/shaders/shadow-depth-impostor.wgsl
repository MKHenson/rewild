// Depth-only shadow pass for the impostor tier — shadow-depth-instanced.wgsl's
// job for a billboard instead of a mesh.
//
// The quad faces the sun rather than the camera, and shows the tile captured
// from the sun's direction, so the shadow on the ground is the model's own
// silhouette as the light sees it. One tile, not the blended three: a shadow
// this far out is a soft blob a texel or two across, and nothing a crossfade
// would show survives the filter.

#include "./shader-lib/scatter-impostor.wgsl"

struct Uniforms {
  // lightVP * the chunk's world matrix.
  shadowMVP : mat4x4f,
  // xyz = viewer in chunk-local space. w unused.
  viewer : vec4f,
  // x = metres at which this tier takes over, y = metres at which it hands
  // over.
  range : vec4f,
  // xyz = direction toward the sun, chunk-local. w unused.
  lightDir : vec4f,
}

struct ScatterInstance {
  posScale : vec4f,
  rotation : vec4f,
  params : vec4f,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> instances : array<ScatterInstance>;
@group(0) @binding(2) var atlasSampler : sampler;
@group(0) @binding(3) var albedoAtlas : texture_2d<f32>;
@group(0) @binding(4) var<uniform> impostor : ImpostorParams;

const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) @interpolate(flat) octDir : vec3f,
}

fn rotateByQuat(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
  @builtin(instance_index) instanceIndex : u32
) -> VertexOutput {
  var output : VertexOutput;
  let instance = instances[instanceIndex];
  let scale = instance.posScale.w;
  let q = instance.rotation;

  let centre = instance.posScale.xyz + rotateByQuat(q, impostor.centre.xyz * scale);

  // The same viewer band the scene pass keeps, so the caster set is the drawn
  // set, tier for tier.
  let viewDistance = distance(instance.posScale.xyz, uniforms.viewer.xyz);
  if (viewDistance < uniforms.range.x || viewDistance >= uniforms.range.y) {
    output.Position = CULLED_POSITION;
    return output;
  }

  let dirModel = rotateByQuat(quatConjugate(q), uniforms.lightDir.xyz);
  let octDir = impostorHemiDir(dirModel);
  let right = impostorRight(octDir);
  let up = impostorUp(octDir, right);
  let corner = (right * position.x + up * position.y) * impostor.centre.w * scale;
  let chunkPosition = centre + rotateByQuat(q, corner);

  output.Position = uniforms.shadowMVP * vec4f(chunkPosition, 1.0);
  output.uv = uv;
  output.octDir = octDir;
  return output;
}

@fragment
fn fs(
  @location(0) uv : vec2f,
  @location(1) @interpolate(flat) octDir : vec3f
) {
  let tiles = impostor.atlas.x;
  let tile = round(impostorOctUv(octDir) * (tiles - 1.0));
  let coverage = textureSample(albedoAtlas, atlasSampler, (tile + uv) / tiles).a;
  if (coverage < impostor.atlas.y) {
    discard;
  }
}
