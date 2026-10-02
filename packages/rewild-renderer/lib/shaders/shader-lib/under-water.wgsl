// The water around the camera (UnderWater). The host declares
// `underWater : UnderWater`. The probe results are the water probe's, copied
// in on the GPU the same frame, so nothing here lags.
//
// The lens is the camera's near plane. The water between the eye and the lens
// is clipped away, so a pixel is in water when its ray meets the lens below
// the surface. The lens spans centimetres, so the surface over it is taken as
// the plane through the probes at the camera and a step along x and along z.

struct UnderWater {
  // x: 1 while the camera may be under water. y: the camera's world height.
  // z: world height of the water's level at rest there. w: world height of
  // the ground under it.
  camera : vec4f,
  // The probes at the camera, a step along +x and a step along +z: x metres
  // the surface stands above the level, y the surface's world height, which
  // is below -1e29 where a probe found no water.
  probe : vec4f,
  probeX : vec4f,
  probeZ : vec4f,
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
  // x: metres from the eye to the lens. y: metres between the probes.
  lens : vec4f,
  // The camera's world matrix.
  viewToWorld : mat4x4f,
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

// The surface's rise per metre along x and z over the lens; flat where a
// neighbouring probe found no water.
fn lensSlope() -> vec2f {
  let step = underWater.lens.y;
  let centre = underWater.probe.y;
  let x = select(0.0, (underWater.probeX.y - centre) / step, underWater.probeX.y > -1e29);
  let z = select(0.0, (underWater.probeZ.y - centre) / step, underWater.probeZ.y > -1e29);
  return vec2f(x, z);
}

// Metres the surface stands above the lens where the world view direction
// `dir` meets it: positive in water, negative in air.
fn lensWaterDepth(dir: vec3f) -> f32 {
  let eye = underWater.viewToWorld[3].xyz;
  let forward = -underWater.viewToWorld[2].xyz;
  let lens = eye + dir * (underWater.lens.x / max(dot(dir, forward), 1e-3));
  let slope = lensSlope();
  let surface = underWater.probe.y + slope.x * (lens.x - eye.x) + slope.y * (lens.z - eye.z);
  return surface - lens.y;
}

// Whether the pixel looking along world direction `dir` sees from in the
// water.
fn lensInWater(dir: vec3f) -> bool {
  return underWater.camera.x > 0.5 && lensWaterDepth(dir) > 0.0;
}
