// lightType: 0 = point, 1 = directional, 2 = spot
struct Light {
  positionOrDirection : vec3f,  // point/spot: view-space position; directional: view-space direction
  intensity : f32,
  color : vec3f,
  range : f32,                  // point/spot: cutoff distance
  direction : vec3f,            // spot: view-space cone axis
  lightType : f32,
  innerAngle : f32,             // spot: inner cone half-angle in radians
  outerAngle : f32,             // spot: outer cone half-angle in radians
  _pad0 : f32,
  _pad1 : f32,
}

struct LightingUniforms {
  numLights : u32,
  lights : array<Light>,
}

// A real lamp has size, so its radiance stops climbing once you are inside it.
// A point light has none, so 1/d² is singular at the source. Clamping the
// denominator caps a light's contribution at 1/LIGHT_MIN_DISTANCE², which is
// roughly "a surface pressed against a 20cm lamp".
const LIGHT_MIN_DISTANCE: f32 = 0.1;

// Distance falloff for point and spot lights: inverse-square, windowed so it
// reaches exactly zero at `range`.
//
// Two things have to be true at once. Radiance genuinely falls as 1/d², and the
// `1 - dist/range` ramp this replaces got that most wrong in the near field,
// where it is nearly flat and the real curve is at its steepest. But the
// renderer also needs a hard cutoff: Foxfire's culling budget drops a light
// outright past its range, and a naked 1/d² never reaches zero, so every light
// would pop as it left the budget.
//
// The window is Karis' `(1 - (d/range)^4)^2` — close enough to 1 through most
// of the useful range that it barely perturbs the inverse square, then steep
// into a value *and* slope of zero at `range`, so the cutoff is invisible.
//
// Note this changes the shape of the falloff, not the unit intensity is
// expressed in — that stays anchored to the sky's radiance scale. See
// docs/milestones/lichen.md.
fn lightDistanceAttenuation(dist: f32, range: f32) -> f32 {
  let d2 = max(dist * dist, LIGHT_MIN_DISTANCE * LIGHT_MIN_DISTANCE);
  let ratio = clamp(dist / max(range, 0.0001), 0.0, 1.0);
  let ratio2 = ratio * ratio;
  let window = 1.0 - ratio2 * ratio2;
  return (window * window) / d2;
}