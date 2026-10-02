// The water around the camera (UnderWater). The host declares
// `underWater : UnderWater`. `probe` is the water probe's result at the
// camera, copied in on the GPU the same frame, so `cameraInWater` never lags.

struct UnderWater {
  // x: 1 while the camera may be under water. y: the camera's world height.
  // z: world height of the water's level at rest there. w: world height of
  // the ground under it.
  camera : vec4f,
  // The probe at the camera: x metres the surface stands above the level,
  // y the surface's world height.
  probe : vec4f,
  // rgb: extinction per metre, absorption plus turbidity.
  extinction : vec4f,
  // rgb: the palette's in-water glow, the share of the light the water
  // scatters toward a viewer inside it.
  inScatter : vec4f,
  // rgb: the sun's radiance in the water, across its beam. a: the cosine of
  // its refracted angle from straight up; 0 while it is down.
  sun : vec4f,
  // xyz: the way toward the refracted sun in the water, world space.
  sunDirection : vec4f,
}

fn cameraInWater() -> bool {
  return underWater.camera.x > 0.5 && underWater.camera.y < underWater.probe.y;
}

// Metres of water above the camera.
fn cameraWaterDepth() -> f32 {
  return max(underWater.probe.y - underWater.camera.y, 0.0);
}

// Metres from the camera down to the bed.
fn cameraBedBelow() -> f32 {
  return max(underWater.camera.y - underWater.camera.w, 0.0);
}
