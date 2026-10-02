// Water probe (WaterProbe): where the drawn surface stands over a few points.
// The waves move water sideways as well as up, so the water over a point
// rested somewhere else. A few fixed-point steps find that rest position, and
// the point takes its height.

#include "./shader-lib/water-waves.wgsl"
#include "./shader-lib/shore-waves.wgsl"
#include "./shader-lib/water-surface.wgsl"

const SOLVE_STEPS: i32 = 4;
const NO_SURFACE: f32 = -1e30;

struct ProbePoint {
  // xy: world xz from the waves' origin. z: metres of water under the level,
  // as the water map gives it. w: world height of the level.
  place : vec4f,
  // Palette weights summing to 1.
  weights : vec4f,
}

@group(0) @binding(0) var<uniform> waves : Waves;
@group(0) @binding(1) var<storage, read> points : array<ProbePoint>;
// Per point: x metres the surface stands above the level, y the surface's
// world height, zw the sideways move of the water now over the point. A point
// nobody asked for has no surface: y is NO_SURFACE.
@group(0) @binding(2) var<storage, read_write> results : array<vec4f>;
@group(0) @binding(3) var oceanDisplacement : texture_2d_array<f32>;
@group(0) @binding(4) var oceanSampler : sampler;
@group(0) @binding(5) var shoreMap : texture_2d<f32>;
@group(0) @binding(6) var swashMap : texture_2d<f32>;
@group(0) @binding(7) var surfaceSampler : sampler;

@compute @workgroup_size(16, 1, 1)
fn probe(@builtin(global_invocation_id) id : vec3u) {
  let index = id.x;
  if (index >= arrayLength(&points)) {
    return;
  }
  let point = points[index];
  let goal = point.place.xy;
  let depth = point.place.z;
  let level = point.place.w;
  let weights = point.weights;
  if (dot(weights, vec4f(1.0)) <= 0.0) {
    results[index] = vec4f(0.0, NO_SURFACE, 0.0, 0.0);
    return;
  }

  var rest = goal;
  var surface = surfaceDisplacement(rest, depth, weights, surfaceSpacing(rest, level));
  for (var i = 0; i < SOLVE_STEPS; i++) {
    rest = goal - surface.displacement.xz;
    surface = surfaceDisplacement(rest, depth, weights, surfaceSpacing(rest, level));
  }
  let height = surface.displacement.y + surface.lift;
  results[index] = vec4f(height, level + height, surface.displacement.xz);
}
