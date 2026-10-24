// Linear blend skinning over a model's shared joint matrix buffer.
//
// The including shader declares `jointMatrices`: every pose's joint matrices
// back to back, `jointCount` per pose slot, in model space with the inverse
// bind already applied.

// One drawn SkinnedMesh: where it stands, and which pose slot it draws.
struct SkinnedInstance {
  world : mat4x4f,
  slot : u32,
}

fn skinMatrix(
  slot: u32,
  jointCount: u32,
  joints: vec4u,
  weights: vec4f
) -> mat4x4f {
  let base = slot * jointCount;
  return jointMatrices[base + joints.x] * weights.x +
    jointMatrices[base + joints.y] * weights.y +
    jointMatrices[base + joints.z] * weights.z +
    jointMatrices[base + joints.w] * weights.w;
}
