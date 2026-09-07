// Depth-only shadow pass for scatter — shadow-depth.wgsl's job over the same
// persistent instance buffer scatter-instanced.wgsl draws from.
//
// The instance transform is duplicated here rather than shared because the two
// shaders reach it through different bind groups: the scene pass has a camera
// and a material to place first, this one has a light matrix and nothing else.
// Both read the identical ScatterInstance layout out of the identical buffer,
// so a caster stands exactly where its lit copy does.

struct Uniforms {
  // lightVP * the chunk's world matrix, so instance positions stay in the
  // chunk-local space they were generated in.
  shadowMVP : mat4x4f,
  // The primitive's transform within its model, applied before the instance.
  nodeMatrix : mat4x4f,
  // xyz = viewer in chunk-local space, w = the layer's cull distance.
  viewer : vec4f,
}

struct ScatterInstance {
  posScale : vec4f,
  rotation : vec4f,
  params : vec4f,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> instances : array<ScatterInstance>;

const CULLED_POSITION = vec4f(0.0, 0.0, 2.0, 1.0);

fn rotateByQuat(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(
  @location(0) position : vec3f,
  @builtin(instance_index) instanceIndex : u32
) -> @builtin(position) vec4f {
  let instance = instances[instanceIndex];

  let nodePosition = (uniforms.nodeMatrix * vec4f(position, 1.0)).xyz;
  let chunkPosition =
    instance.posScale.xyz +
    rotateByQuat(instance.rotation, nodePosition * instance.posScale.w);

  // The same viewer-distance test the scene pass applies, so the caster set and
  // the drawn set are one set. Skipping it would shadow the ground from trees
  // that are not there, and draw a whole 480m chunk three times over for the
  // handful of instances actually in range.
  if (distance(chunkPosition, uniforms.viewer.xyz) > uniforms.viewer.w) {
    return CULLED_POSITION;
  }

  return uniforms.shadowMVP * vec4f(chunkPosition, 1.0);
}
