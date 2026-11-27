// A bar filled from the left to a value. The effect params are the value from
// 0 to 1, the full colour, the empty colour and the extras. Each colour is
// packed as r * 65536 + g * 256 + b, with channels from 0 to 255. The extras
// pack the trail as trail * 4095, the ticks times 4096 and the danger in
// percent times 131072. The quad has an outset for the danger glow.

const GLOW_REACH = 4.0;

fn unpackColor(packed: f32) -> vec3f {
  let v = u32(packed);
  return vec3f(f32((v >> 16u) & 255u), f32((v >> 8u) & 255u), f32(v & 255u)) / 255.0;
}

// Two quick beats, then a rest, once per unit of `t`.
fn heartbeat(t: f32) -> f32 {
  let phase = fract(t);
  let beatA = (phase - 0.1) / 0.06;
  let beatB = (phase - 0.32) / 0.07;
  return exp(-beatA * beatA) + 0.7 * exp(-beatB * beatB);
}

// Lays a premultiplied colour over another.
fn blendOver(top: vec4f, under: vec4f) -> vec4f {
  return top + under * (1.0 - top.a);
}

// The coverage of a bar from the left edge to `width`, with the box's corners
// at both ends.
fn barCoverage(local: vec2f, width: f32, size: vec2f, radii: vec4f) -> f32 {
  if (width <= 0.0) {
    return 0.0;
  }
  let r = min(radii, vec4f(min(width, size.y) * 0.5));
  return coverage(roundRectDistance(local, vec4f(0.0, 0.0, width, size.y), r));
}

fn effect(prim: Primitive, px: Pixel) -> vec4f {
  let size = prim.rect.zw;
  let local = px.local;
  let value = prim.effect.x;
  let full = unpackColor(prim.effect.y);
  let empty = unpackColor(prim.effect.z);
  let extras = u32(prim.effect.w + 0.5);
  let trail = f32(extras & 4095u) / 4095.0;
  let ticks = f32((extras >> 12u) & 31u);
  let danger = f32(extras >> 17u) / 100.0;

  let tint = mix(empty, full, value);
  let peril = select(0.0, 1.0 - value / max(danger, 1e-4), value < danger);
  let beat = heartbeat(u.time * mix(1.0, 1.8, peril)) * peril;
  let shade = clamp(local.y / size.y, 0.0, 1.0);

  // The track: a dark, see-through groove that flushes on each beat.
  let trackAlpha = 0.55 + 0.3 * beat;
  let trackRgb = empty * (mix(0.1, 0.25, shade) + 0.5 * beat);
  var color = vec4f(trackRgb * trackAlpha, trackAlpha);

  // The trail: pale where value was lost, bright with a shine where it was gained.
  let low = min(value, trail);
  let high = max(value, trail);
  let lowCover = barCoverage(local, size.x * low, size, prim.radii);
  let bandCover = barCoverage(local, size.x * high, size, prim.radii) * (1.0 - lowCover);
  if (bandCover > 0.0) {
    var band: vec3f;
    if (trail > value) {
      band = mix(tint, vec3f(1.0), 0.65);
    } else {
      let span = max((high - low) * size.x, 1.0);
      let k = (local.x - low * size.x) / span - fract(u.time * 0.9) * 1.6 + 0.3;
      band = mix(full, vec3f(1.0), 0.3 + 0.5 * exp(-k * k * 30.0));
    }
    color = blendOver(vec4f(band, 1.0) * bandCover * 0.85, color);
  }

  // The fill, darker at the bottom, with a gloss along its top.
  let gloss = (1.0 - smoothstep(0.0, 0.55, shade)) * 0.35;
  var fillRgb = tint * mix(1.05, 0.65, shade);
  fillRgb = mix(fillRgb, vec3f(1.0), gloss) * (1.0 + 0.45 * beat);
  color = blendOver(vec4f(fillRgb, 1.0) * lowCover, color);

  // Ticks: thin dark lines that split the bar into equal parts.
  if (ticks > 1.0) {
    let cell = local.x / size.x * ticks;
    let d = abs(fract(cell + 0.5) - 0.5) * size.x / ticks;
    let inside = cell > 0.5 && cell < ticks - 0.5;
    let tick = select(0.0, clamp(0.5 - (d - 0.5) * scale, 0.0, 1.0), inside);
    color = vec4f(color.rgb * (1.0 - 0.4 * tick), color.a);
  }

  let bar = withBorder(color, prim, px.inner) * px.outer;
  let outside = max(px.edge, 0.0);
  let glow = beat * 0.6 * exp(-outside / GLOW_REACH) * (1.0 - px.outer);
  return bar + vec4f(tint * glow, glow);
}
