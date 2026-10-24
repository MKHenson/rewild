// Depth-only shadow pass for SkinnedMeshes. Reads the same joint matrix buffer
// as standard-skinned.wgsl, so a caster's pose matches its lit copy.

struct Uniforms {
  shadowVP : mat4x4f,
  // x = joints per pose.
  params : vec4f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<storage, read> instances : array<SkinnedInstance>;
@group(0) @binding(2) var<storage, read> jointMatrices : array<mat4x4f>;

#include "./shader-lib/skinning.wgsl"

@vertex
fn vs(
  @location(0) position : vec3f,
  @location(1) joints : vec4u,
  @location(2) weights : vec4f,
  @builtin(instance_index) instanceIndex : u32
) -> @builtin(position) vec4f {
  let instance = instances[instanceIndex];
  let skin = skinMatrix(instance.slot, u32(uniforms.params.x), joints, weights);
  return uniforms.shadowVP * instance.world * skin * vec4f(position, 1.0);
}
