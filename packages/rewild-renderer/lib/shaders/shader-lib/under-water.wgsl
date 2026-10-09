// The water around the camera (UnderWater). The host declares
// `underWater : UnderWater`. The probe results are the water probe's, copied
// in on the GPU the same frame, so nothing here lags.
//
// The lens is the camera's near plane. The water between the eye and the lens
// is clipped away, so a pixel is in water when its ray meets the lens below
// the drawn surface. A pixel spans a fraction of a millimetre of the lens, so
// the surface is the drawn grid's own triangles, rebuilt from its vertices
// around the camera, not the smooth waves between them.

// Vertices per side of the patch (LENS_PATCH_SIDE).
const LENS_PATCH_SIDE: i32 = 4;
const LENS_SOLVE_STEPS: i32 = 6;
// Metres from the surface past which the lens is surely on one side of it.
const LENS_CLEAR: f32 = 1.0;

struct UnderWater {
  // x: 1 while the camera may be under water. y: the camera's world height.
  // z: world height of the water's level at rest there. w: world height of
  // the ground under it.
  camera : vec4f,
  // The probe at the camera: x metres the surface stands above the level, y
  // the surface's world height, which is below -1e29 where it found no water.
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
  // x: metres from the eye to the lens. y: metres between the patch's
  // vertices. zw: world xz of its first vertex less the eye's.
  lens : vec4f,
  // The camera's world matrix.
  viewToWorld : mat4x4f,
  // The drawn grid's vertices around the camera, +x first, as the probe gives
  // them: y the world height, below -1e29 where it found no water, zw the
  // sideways move.
  grid : array<vec4f, 16>,
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

// Patch vertex (i, j): x, z its sideways move in metres, y its world height.
// One without water sits at the camera's surface, unmoved.
fn lensPatchVertex(i: i32, j: i32) -> vec3f {
  let v = underWater.grid[j * LENS_PATCH_SIDE + i];
  return select(vec3f(0.0, underWater.probe.y, 0.0), v.zyw, v.y > -1e29);
}

// The patch's vertices interpolated at `at`, in vertices from the first, over
// the triangles the grid draws: each quad splits from its (0, 1) corner to its
// (1, 0) corner (WaterGrid).
fn lensPatchAt(at: vec2f) -> vec3f {
  let p = clamp(at, vec2f(0.0), vec2f(f32(LENS_PATCH_SIDE - 1)));
  let cell = min(vec2i(floor(p)), vec2i(LENS_PATCH_SIDE - 2));
  let f = p - vec2f(cell);
  let a = lensPatchVertex(cell.x, cell.y);
  let b = lensPatchVertex(cell.x + 1, cell.y);
  let c = lensPatchVertex(cell.x, cell.y + 1);
  if (f.x + f.y <= 1.0) {
    return a + (b - a) * f.x + (c - a) * f.y;
  }
  let d = lensPatchVertex(cell.x + 1, cell.y + 1);
  return d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
}

// Metres the drawn surface stands above the lens where the world view
// direction `dir` meets it: positive in water, negative in air.
fn lensWaterDepth(dir: vec3f) -> f32 {
  let forward = -underWater.viewToWorld[2].xyz;
  let offset = dir * (underWater.lens.x / max(dot(dir, forward), 1e-3));
  let lensY = underWater.camera.y + offset.y;
  if (abs(underWater.probe.y - lensY) > LENS_CLEAR) {
    return underWater.probe.y - lensY;
  }
  return lensPatchHeight(offset.xz) - lensY;
}

// World height of the drawn surface over the point `offset` metres from the
// eye along x and z, by the patch. The water there rested elsewhere: a few
// fixed-point steps find where, as the probe does for the smooth waves.
fn lensPatchHeight(offset: vec2f) -> f32 {
  let spacing = underWater.lens.y;
  let goal = (offset - underWater.lens.zw) / spacing;
  var surface = lensPatchAt(goal);
  for (var i = 0; i < LENS_SOLVE_STEPS; i++) {
    surface = lensPatchAt(goal - surface.xz / spacing);
  }
  return surface.y;
}

// Whether the pixel looking along world direction `dir` sees from in the
// water.
fn lensInWater(dir: vec3f) -> bool {
  return underWater.camera.x > 0.5 && lensWaterDepth(dir) > 0.0;
}
