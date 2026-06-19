struct SpotLightShadowParams {
  // lightVP * camera.matrixWorld — transforms a view-space position into spot light clip space.
  lightMVPFromView: mat4x4f,
  // Index of the shadow-casting spot light in the lighting storage buffer.
  lightIndex: u32,
  // 1 when a shadow-casting spot light exists this frame, 0 otherwise.
  hasSpotShadow: u32,
  _pad0: u32,
  _pad1: u32,
};
