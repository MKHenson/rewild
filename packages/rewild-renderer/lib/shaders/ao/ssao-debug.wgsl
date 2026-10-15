// Shows a half-resolution AO target over the whole screen: white is open sky,
// black fully occluded.

#include "./ao-common.wgsl"

@group(0) @binding(0) var aoTexture: texture_2d<f32>;

@fragment
fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(aoTexture));
  let visibility = textureLoad(aoTexture, min(vec2i(position.xy) / 2, size - 1), 0).r;
  return vec4f(vec3f(visibility), 1.0);
}
