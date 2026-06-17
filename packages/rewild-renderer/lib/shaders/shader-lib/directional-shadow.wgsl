struct DirectionalShadowParams {
  // One matrix per cascade: lightVP[i] * camera.matrixWorld, baked each frame.
  lightMVPFromView: array<mat4x4f, 3>,
  // View-space depth where each cascade ends: x = cascade 0 end, y = cascade 1 end, z = cascade 2 end.
  cascadeSplits: vec4f,
};
