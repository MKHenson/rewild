// Heat haze over hot ground (HeatShimmer). Each pixel of the composited frame
// is read from a little off where it lies, by noise in wide, short cells that
// rises up the screen as hot air does. The shift grows with how far the view
// ray runs through the air, from none at NEAR_START metres to all of it at
// FAR_FULL, and only along rays near level: one looking up or down soon leaves
// the layer the ground heats. A shifted sample that lands on something much
// nearer than the pixel is not read, so the foreground does not smear into
// what lies behind it.

const NEAR_START: f32 = 8.0;
const FAR_FULL: f32 = 250.0;
// The sine of the view ray's angle from level under which the haze is full,
// and over which it is gone.
const LEVEL_FULL: f32 = 0.04;
const LEVEL_NONE: f32 = 0.3;
// A noise cell's size, as a share of the frame's height.
const CELL_WIDTH: f32 = 0.012;
const CELL_HEIGHT: f32 = 0.0035;
// The furthest a pixel is read from, as a share of the frame's height, and
// how much of that is sideways.
const MAX_SHIFT: f32 = 0.0015;
const SIDEWAYS: f32 = 0.35;
// A sample nearer than this share of the pixel's distance is in front of it.
const FOREGROUND: f32 = 0.7;
// Rows of cells before the noise repeats; the rise wraps at it (HeatShimmer).
const NOISE_PERIOD: i32 = 256;

struct ShimmerParams {
  inverseProjection : mat4x4f,
  // xyz: world up in view space. w: how far the noise has risen, in cells.
  up : vec4f,
  // xy: the frame's size in pixels. z: the haze's strength, 0..1. w: the
  // noise's octaves.
  frame : vec4f,
}

@group(0) @binding(0) var<uniform> shimmer : ShimmerParams;
@group(0) @binding(1) var frame : texture_2d<f32>;
@group(0) @binding(2) var frameSampler : sampler;
@group(0) @binding(3) var sceneDepth : texture_depth_2d;

fn latticeHash(cell : vec2i) -> f32 {
  let row = ((cell.y % NOISE_PERIOD) + NOISE_PERIOD) % NOISE_PERIOD;
  var h = (u32(cell.x) * 0x8da6b343u) ^ (u32(row) * 0xd8163841u);
  h = (h ^ (h >> 13u)) * 0x2c1b3c6du;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967295.0 * 2.0 - 1.0;
}

// -1..1 value noise over unit cells, repeating every NOISE_PERIOD rows.
fn valueNoise(p : vec2f) -> f32 {
  let cell = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = latticeHash(cell);
  let b = latticeHash(cell + vec2i(1, 0));
  let c = latticeHash(cell + vec2i(0, 1));
  let d = latticeHash(cell + vec2i(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn heatNoise(p : vec2f) -> f32 {
  let coarse = valueNoise(p);
  if (shimmer.frame.w < 1.5) {
    return coarse;
  }
  return coarse * 0.7 + valueNoise(p * 2.0) * 0.3;
}

fn viewPosition(pixel : vec2f) -> vec3f {
  let size = shimmer.frame.xy;
  let depth = textureLoad(sceneDepth, vec2i(pixel), 0);
  let ndc = vec2f(pixel.x / size.x * 2.0 - 1.0, 1.0 - pixel.y / size.y * 2.0);
  let view = shimmer.inverseProjection * vec4f(ndc, depth, 1.0);
  return view.xyz / view.w;
}

@fragment
fn fs(@builtin(position) position : vec4f) -> @location(0) vec4f {
  let pixel = position.xy;
  let base = textureLoad(frame, vec2i(pixel), 0);
  let size = shimmer.frame.xy;
  let view = viewPosition(pixel);
  let reach = length(view);
  let level = abs(dot(view / max(reach, 1e-4), shimmer.up.xyz));
  let weight = shimmer.frame.z
             * smoothstep(NEAR_START, FAR_FULL, reach)
             * (1.0 - smoothstep(LEVEL_FULL, LEVEL_NONE, level));
  if (weight <= 0.0) {
    return base;
  }

  let p = vec2f(
    pixel.x / (size.y * CELL_WIDTH),
    pixel.y / (size.y * CELL_HEIGHT) + shimmer.up.w
  );
  let shift = vec2f(heatNoise(p + vec2f(37.0, 0.0)) * SIDEWAYS, heatNoise(p))
            * weight * MAX_SHIFT * size.y;
  let at = clamp(pixel + shift, vec2f(0.5), size - 0.5);
  if (length(viewPosition(at)) < reach * FOREGROUND) {
    return base;
  }
  return vec4f(textureSampleLevel(frame, frameSampler, at / size, 0.0).rgb, base.a);
}
