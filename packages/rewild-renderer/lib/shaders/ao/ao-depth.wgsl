// Needs from the host: `ao: AoParams` and `sceneDepth`, the full-resolution
// depth buffer.

fn aoLoadDepth(texel: vec2i, size: vec2i) -> f32 {
  return textureLoad(sceneDepth, clamp(texel, vec2i(0), size - 1), 0);
}

// View-space position of full-resolution texel `texel`.
fn aoViewPosition(texel: vec2i, size: vec2i) -> vec3f {
  let depth = aoLoadDepth(texel, size);
  let uv = (vec2f(texel) + 0.5) / vec2f(size);
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let view = ao.inverseProjection * vec4f(ndc, depth, 1.0);
  return view.xyz / view.w;
}
