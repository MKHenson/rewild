// A surface effect: the surface turns on as a hologram as its `effectValue`
// goes from 0 to 1. A dot of light stretches into a line, the line opens into
// the surface with bright edges and scanlines, and the surface flickers twice
// and settles. From 1 to 0 it turns off the same way. At 1 it changes nothing.

// Where the dot is a full-width line, and where the line is the full panel.
const HOLO_LINE_END = 0.25;
const HOLO_OPEN_END = 0.7;
// The line's thickness, and how far the edge glow reaches, in CSS pixels.
const HOLO_LINE = 4.0;
// The scanlines' spacing in CSS pixels, and how fast they drift, in lines a second.
const HOLO_SCANLINE = 4.0;
const HOLO_DRIFT = 4.0;

fn holoEaseOut(t: f32) -> f32 {
  let c = 1.0 - clamp(t, 0.0, 1.0);
  return 1.0 - c * c * c;
}

// The share of the surface's width and height that shows.
fn holoScale() -> vec2f {
  let s = u.effectValue;
  let size = max(u.viewport, vec2f(1.0));
  let line = min(HOLO_LINE / size.y, 1.0);
  // The dot is as wide as the line is thick.
  let point = min(HOLO_LINE / size.x, 1.0);
  let x = max(holoEaseOut(s / HOLO_LINE_END), point);
  let y = mix(line, 1.0, holoEaseOut((s - HOLO_LINE_END) / (HOLO_OPEN_END - HOLO_LINE_END)));
  return vec2f(x, y);
}

// Squeezes the surface's point toward its centre, as much as it shows.
fn surfacePlace(p: vec2f) -> vec2f {
  if (u.effectValue >= 1.0) {
    return p;
  }
  let centre = u.viewport * 0.5;
  return centre + (p - centre) * holoScale();
}

// Lights the surface's colour at its point `p`, before the squeeze.
fn surfaceColor(color: vec4f, p: vec2f) -> vec4f {
  let s = u.effectValue;
  if (s >= 1.0) {
    return color;
  }
  let squeeze = holoScale();
  let settle = smoothstep(HOLO_OPEN_END, 1.0, s);
  // Scanlines that drift down, and fade as the panel settles.
  let drawnY = p.y * squeeze.y;
  let stripe = 0.5 + 0.5 * sin((drawnY / HOLO_SCANLINE - u.time * HOLO_DRIFT) * 6.2831853);
  var shown = color * (1.0 - 0.35 * (1.0 - settle) * stripe);
  // Two quick flickers before it settles.
  let flicker = step(0.78, s) - step(0.81, s) + step(0.88, s) - step(0.9, s);
  shown *= 1.0 - 0.6 * flicker;
  // The dot fades in from nothing, and out to nothing.
  shown *= smoothstep(0.0, 0.04, s);
  // The top and bottom edges glow white as they open. Premultiplied white
  // keeps the pixel's alpha.
  let edge = min(p.y, u.viewport.y - p.y) * squeeze.y;
  let glow = exp(-max(edge, 0.0) / HOLO_LINE) * (1.0 - settle);
  return mix(shown, vec4f(shown.a), glow);
}
