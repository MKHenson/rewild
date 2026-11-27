// A scale from a start colour through a middle colour to an end colour, with
// a marker at a value. It runs up a box taller than it is wide, else to the
// right. The effect params are the value from 0 to 1, then the start, middle
// and end colours, each packed as r * 65536 + g * 256 + b.

// From this far from the middle, 0 to 1, the end at the marker glows.
const GAUGE_DANGER = 0.6;

fn unpackGaugeColor(packed: f32) -> vec3f {
  let v = u32(packed);
  return vec3f(f32((v >> 16u) & 255u), f32((v >> 8u) & 255u), f32(v & 255u)) / 255.0;
}

fn effect(prim: Primitive, px: Pixel) -> vec4f {
  let size = prim.rect.zw;
  let vertical = size.y > size.x;
  let span = select(size.x, size.y, vertical);
  let width = select(size.y, size.x, vertical);
  let along = clamp(select(px.local.x / size.x, 1.0 - px.local.y / size.y, vertical), 0.0, 1.0);
  let across = clamp(select(px.local.y / size.y, px.local.x / size.x, vertical), 0.0, 1.0);
  let value = prim.effect.x;
  let cold = unpackGaugeColor(prim.effect.y);
  let middle = unpackGaugeColor(prim.effect.z);
  let hot = unpackGaugeColor(prim.effect.w);

  let scaleRgb = select(mix(middle, hot, along * 2.0 - 1.0), mix(cold, middle, along * 2.0), along < 0.5);
  let markerAt = clamp(value * span, 2.0, span - 2.0);
  let gap = abs(along * span - markerAt);
  let near = exp(-gap / (width * 2.5));

  // The end the marker is near glows, and breathes, as the value nears it.
  let reach = abs(value * 2.0 - 1.0);
  let peril = smoothstep(GAUGE_DANGER, 1.0, reach);
  let atEnd = select(1.0 - along, along, value > 0.5);
  let breath = 0.65 + 0.35 * sin(u.time * 4.0);
  let glow = peril * pow(atEnd, 5.0) * breath;

  let gloss = (1.0 - smoothstep(0.0, 0.6, across)) * 0.25;
  let rgb = mix(scaleRgb * (0.35 + 0.65 * near + 0.8 * glow), vec3f(1.0), gloss);
  let alpha = 0.6 + 0.4 * max(near, glow);
  var color = vec4f(rgb * alpha, alpha);

  // The marker: a white band across the scale, with a dark rim.
  let rim = clamp(0.5 - (gap - 2.5) * scale, 0.0, 1.0);
  let mark = clamp(0.5 - (gap - 1.25) * scale, 0.0, 1.0);
  color = mix(color, vec4f(0.0, 0.0, 0.0, 0.7), rim);
  color = mix(color, vec4f(1.0), mark);
  return withBorder(color, prim, px.inner);
}
