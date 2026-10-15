// Shared by the SSAO passes.
//
// The AO targets are half resolution, rg: r the visibility (1 = open sky), g
// the view depth in metres of the full-resolution texel it was taken at, which
// is texel 2h for half texel h.

struct AoParams {
  projection: mat4x4f,
  inverseProjection: mat4x4f,
  radius: f32,
  // Exponent on visibility; above 1 darkens.
  intensity: f32,
  fadeStart: f32,
  fadeEnd: f32,
  // Share of the AO applied to direct light as well as indirect.
  directStrength: f32,
}

// Written for depth-buffer texels that hold no surface.
const AO_SKY_DEPTH: f32 = 65000.0;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
