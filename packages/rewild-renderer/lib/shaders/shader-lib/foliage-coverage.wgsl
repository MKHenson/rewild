// How far a foliage texel darkens with the coverage it was sampled at. A leaf
// interior reads 1 and keeps its colour; an edge, or a mip where the leaf has
// averaged against its gaps, reads less and darkens with it. That stands in
// for the shade between leaves the texture cannot hold, and it grows with
// distance the way a crown's depth does.
//
// An exponent on the coverage: 1 darkens by it in full, lower lifts the soft
// partial texels a blade edge is made of, 0 turns it off.
const FOLIAGE_COVERAGE_SHADE: f32 = 0.6;

fn foliageCoverageShade(color : vec3f, coverage : f32) -> vec3f {
  return color * pow(clamp(coverage, 1e-4, 1.0), FOLIAGE_COVERAGE_SHADE);
}
