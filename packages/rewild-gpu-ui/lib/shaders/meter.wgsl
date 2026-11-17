// A bar filled from the left to a value. The effect params are the value from
// 0 to 1, the full colour and the empty colour. Each colour is packed as
// r * 65536 + g * 256 + b, with channels from 0 to 255.

fn unpackColor(packed: f32) -> vec3f {
  let v = u32(packed);
  return vec3f(f32((v >> 16u) & 255u), f32((v >> 8u) & 255u), f32(v & 255u)) / 255.0;
}

fn effect(prim: Primitive, local: vec2f, inner: f32) -> vec4f {
  let value = prim.effect.x;
  let full = unpackColor(prim.effect.y);
  let empty = unpackColor(prim.effect.z);

  // Lighter at the bottom.
  let shade = local.y / prim.rect.w;
  let filled = vec3f(mix(empty, full, value) * mix(0.6, 1.0, shade));
  let track = empty * mix(0.2, 0.5, shade);
  let fill = vec4f(select(track, filled, local.x < prim.rect.z * value), 1.0);

  // The bar pulses more as it drains, and is steady when full.
  let pulse = mix(mix(0.5, 0.9, 0.5 + 0.5 * sin(u.time * 20.0)), 1.0, value);
  return withBorder(fill, prim, inner) * pulse;
}
