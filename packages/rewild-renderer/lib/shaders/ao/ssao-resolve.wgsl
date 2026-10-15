// Applies AO to the scene colour: all of it to the indirect share, and
// directStrength of it to the rest. The pipeline blends dst * alpha - rgb, so
// with occlusion o = 1 - visibility and k = directStrength,
//   colour * (1 - k o) - indirect * o (1 - k)
// The half-resolution AO is upsampled by bilinear weights scaled by how well
// each texel's depth matches this one.

#include "./ao-common.wgsl"
#include "./ao-depth.wgsl"

@group(0) @binding(0) var sceneDepth: texture_depth_2d;
@group(0) @binding(1) var blurredAo: texture_2d<f32>;
@group(0) @binding(2) var sceneIndirect: texture_2d<f32>;
@group(0) @binding(3) var<uniform> ao: AoParams;

// Visibility at full-resolution `texel`, `viewDepth` metres away.
fn upsampleVisibility(texel: vec2i, viewDepth: f32) -> f32 {
  let aoSize = vec2i(textureDimensions(blurredAo));
  // Half texel h was taken at full texel 2h, so an even texel lands on one and
  // an odd one halfway between two.
  let base = texel / 2;
  let f = vec2f(texel & vec2i(1)) * 0.5;

  var sum = 0.0;
  var weight = 0.0;
  for (var j = 0; j < 2; j++) {
    for (var i = 0; i < 2; i++) {
      let tap = textureLoad(blurredAo, min(base + vec2i(i, j), aoSize - 1), 0);
      let bilinear = select(1.0 - f.x, f.x, i == 1) * select(1.0 - f.y, f.y, j == 1);
      // The small constant lets an off-footprint tap stand in when every
      // footprint tap is across a depth edge.
      let w = (bilinear + 1e-3) / (1e-3 + abs(tap.g - viewDepth) / viewDepth);
      sum += tap.r * w;
      weight += w;
    }
  }
  return sum / weight;
}

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = vec2i(position.xy);
  let size = vec2i(textureDimensions(sceneDepth));
  if (aoLoadDepth(texel, size) >= 1.0) {
    discard;
  }

  let indirect = textureLoad(sceneIndirect, texel, 0).rgb;
  let viewDepth = -aoViewPosition(texel, size).z;
  let occlusion = 1.0 - upsampleVisibility(texel, viewDepth);
  let k = ao.directStrength;
  return vec4f(indirect * occlusion * (1.0 - k), 1.0 - k * occlusion);
}
