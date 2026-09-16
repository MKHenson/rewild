// Foliage wind: a vertex-stage offset from a painted bend weight, driven by
// the weather's wind. Included by the scene pass and the shadow pass so a
// caster sways exactly with its lit copy.
//
// Weights ride in COLOR_0 — R bend (0 rigid, 1 free), G one phase per limb so
// a branch moves as one, B how far up its leaf card a vertex sits, A the
// leaf's own flutter phase so cards on one limb are not in step (1 on
// anything that has no leaf of its own, which is a full turn and so no
// offset). A mesh with no COLOR_0 never reaches here. Normals are not bent:
// nobody has noticed a leaf's normal lagging its position.
//
// The wind is a field, not a clock: a smooth noise over world position,
// blown downwind at the wind's speed, sampled where each vertex stands. Two
// things fall out of that. Neighbours read nearly the same value, so a gust
// is something that arrives, passes through a wood and leaves — and because
// the sample is per vertex, a broad canopy's upwind side leads its lee side
// by a little, which is what a real crown does. Nothing here is keyed to a
// per-vertex random, which is what turns a forest into static.
//
// Everything scales with the weather: the clock in `wind.w` runs at the
// strength, so a calm day's gusts drift slower as well as press less.

const WIND_TAU = 6.28318530718;
// Metres a gust feature spans, and how far the field travels per full-wind
// second — the 10 m/s the rain leans by at strength 1.
const GUST_LENGTH = 60.0;
const GUST_SPEED = 10.0;
// Fraction of the gust speed the finest octave is blown at.
const EDDY_DRIFT = 0.55;

fn windHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// Value noise, 0..1, smooth across cells.
fn windNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(windHash(i), windHash(i + vec2f(1.0, 0.0)), u.x),
    mix(windHash(i + vec2f(0.0, 1.0)), windHash(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

// `wind`: xy = world-space direction the air moves, z = strength 0..1, w =
// the wind clock in full-wind seconds. `params`: x = metres of sway at bend 1
// in full wind, y = sway cycles per full-wind second, z = flutter as a
// fraction of the sway. `origin` is the drawing chunk's world xz, so the
// field is sampled in world space and crosses chunk borders without a seam;
// `chunkPosition` is the vertex after its instance transform.
fn scatterWindOffset(
  wind: vec4f,
  params: vec4f,
  origin: vec2f,
  weights: vec4f,
  instancePhase: f32,
  scale: f32,
  chunkPosition: vec3f
) -> vec3f {
  let bend = weights.r * weights.r;
  let amplitude = params.x * wind.z * scale;
  if (bend * amplitude <= 0.0) {
    return vec3f(0.0);
  }

  let along = vec3f(wind.x, 0.0, wind.y);
  let across = vec3f(-wind.y, 0.0, wind.x);
  let t = wind.w;

  // The field, blown downwind: the point a vertex reads moves upwind through
  // it over time, so its features come toward the viewer with the wind. Three
  // octaves, each offset so none lines up with another. The finest is blown
  // slower than the gusts it rides in, so it drifts through them instead of
  // travelling in lockstep — one field moving as a block reads as a wave
  // train, and this is what breaks it into eddies.
  let drift = wind.xy * (t * GUST_SPEED);
  let p = (chunkPosition.xz + origin - drift) / GUST_LENGTH;
  let e = (chunkPosition.xz + origin - drift * EDDY_DRIFT) / GUST_LENGTH;
  let field =
    0.5 * windNoise(p) +
    0.3 * windNoise(p * 2.7 + vec2f(37.0, 91.0)) +
    0.2 * windNoise(e * 6.3 + vec2f(-71.0, 23.0));
  // A plant under wind keeps a lean; the gust adds to it.
  let gust = 0.3 + 0.7 * field;
  // A second read of the same field, off to one side, steers the lean a
  // little across the wind — turbulence, but coherent turbulence.
  let veer = windNoise(p * 1.9 + vec2f(-53.0, 17.0)) - 0.5;

  // The plant's own sway at the layer's frequency, gated by the gust. Phase
  // spread is a quarter of a cycle per plant and a little per limb: enough
  // that neighbours are not in step, not so much that a wood stops moving
  // together.
  let phase = (0.25 * instancePhase + 0.08 * weights.g) * WIND_TAU;
  let sway = 0.8 + 0.2 * sin(t * params.y * WIND_TAU + phase);
  let lean = amplitude * bend * gust * sway;
  var offset = along * lean + across * (lean * 0.35 * veer);

  // Leaf tips only: fast, small, offset per leaf, growing toward the top of
  // each card.
  let flutter = params.z * wind.z * amplitude * bend * gust * weights.b;
  if (flutter > 0.0) {
    let ft = t * params.y * WIND_TAU * 3.1 + (weights.g + weights.a) * WIND_TAU + phase;
    offset += along * (flutter * 0.6 * sin(ft)) + vec3f(0.0, flutter * 0.4 * cos(ft * 1.37), 0.0);
  }

  return offset;
}
