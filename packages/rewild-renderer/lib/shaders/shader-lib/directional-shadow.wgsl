struct DirectionalShadowParams {
  // One matrix per cascade: lightVP[i] * camera.matrixWorld, baked each frame.
  lightMVPFromView: array<mat4x4f, 3>,
  // View-space depth where each cascade ends: x=c0, y=c1, z=c2, w=sun elevation Y for horizon fade.
  cascadeSplits: vec4f,
  // Non-zero when shadow cascade debug tint is active.
  debugMode: u32,
  // Scales the per-cascade normal-offset bias with the atlas texel size.
  normalOffsetScale: f32,
  // Least sun a shadowed fragment keeps, ground and foliage.
  groundShadowFloor: f32,
  foliageShadowFloor: f32,
};
