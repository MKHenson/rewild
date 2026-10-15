// Depth-aware 4x4 box over the raw AO: exactly one tile of ssao.wgsl's
// rotation pattern, so the pattern averages out, and texels at another depth
// are left out so occlusion does not bleed across silhouettes.

#include "./ao-common.wgsl"

// Relative depth difference at which a tap's weight reaches zero.
const BLUR_DEPTH_TOLERANCE: f32 = 0.05;

@group(0) @binding(0) var rawAo: texture_2d<f32>;

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let center = vec2i(position.xy);
  let size = vec2i(textureDimensions(rawAo));
  let depth = textureLoad(rawAo, center, 0).g;
  if (depth >= AO_SKY_DEPTH) {
    return vec4f(1.0, depth, 0.0, 0.0);
  }

  var sum = 0.0;
  var weight = 0.0;
  for (var y = -2; y <= 1; y++) {
    for (var x = -2; x <= 1; x++) {
      let tap = textureLoad(rawAo, clamp(center + vec2i(x, y), vec2i(0), size - 1), 0);
      let w = max(0.0, 1.0 - abs(tap.g - depth) / (depth * BLUR_DEPTH_TOLERANCE));
      sum += tap.r * w;
      weight += w;
    }
  }

  return vec4f(sum / max(weight, 1e-4), depth, 0.0, 0.0);
}
