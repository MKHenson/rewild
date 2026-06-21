struct DirectionalShadowParams {
  // One matrix per cascade: lightVP[i] * camera.matrixWorld, baked each frame.
  lightMVPFromView: array<mat4x4f, 3>,
  // View-space depth where each cascade ends: x=c0, y=c1, z=c2, w=sun elevation Y for horizon fade.
  cascadeSplits: vec4f,
  // Non-zero when shadow cascade debug tint is active.
  debugMode: u32,
  _p0: u32,
  _p1: u32,
  _p2: u32,
};
