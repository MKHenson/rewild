// The ocean's shore waves (ShoreField, ShoreWaves): two trains whose phase is
// ω × (time − seconds since leaving deep water), so crests roll in along the
// wavefronts, turning toward the shallows and bunching up as the bed rises. A
// breaker grows as the water shallows (Green's law, from SHORE_REF_DEPTH)
// until it is BREAK_INDEX of the depth. They come in between SHORE_FADE_DEEP
// and SHORE_FADE_SHALLOW metres of depth. The host declares `waves : Waves`
// (water-waves.wgsl) and samples the shore field itself.

const BREAK_INDEX: f32 = 0.78;
const SHORE_REF_DEPTH: f32 = 14.0;
const SHORE_FADE_DEEP: f32 = 24.0;
const SHORE_FADE_SHALLOW: f32 = 12.0;
// Each train's share of the breaker height, crest to trough.
const SHORE_TRAIN_SHARE: vec2f = vec2f(0.3, 0.2);
// Noise over SHORE_NOISE_CELL metre cells bends the crests by up to
// SHORE_WOBBLE radians and varies their height down to SHORE_LOW. It repeats
// every SHORE_NOISE_CELLS cells, 1024 m, so it matches across the snapped
// origin.
const SHORE_NOISE_CELL: f32 = 64.0;
const SHORE_NOISE_CELLS: i32 = 16;
const SHORE_WOBBLE: f32 = 1.5;
const SHORE_LOW: f32 = 0.6;

fn shoreHash(cell: vec2i, cells: i32, salt: u32) -> f32 {
  let wrapped = vec2u((cell % cells + cells) % cells);
  var h = wrapped.x * 374761393u + wrapped.y * 668265263u + salt * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return f32(h & 0xffffu) / 65535.0;
}

// Value noise at `p` metres from the origin over `size` metre cells, repeating
// every `cells` of them: x in -1..1, yz its gradient per metre. `size` ×
// `cells` must divide 1024 so it matches across the snapped origin.
fn shoreNoise(p: vec2f, size: f32, cells: i32, salt: u32) -> vec3f {
  let q = p / size;
  let cell = vec2i(floor(q));
  let f = q - floor(q);
  let u = f * f * (3.0 - 2.0 * f);
  let du = 6.0 * f * (1.0 - f);
  let a = shoreHash(cell, cells, salt);
  let b = shoreHash(cell + vec2i(1, 0), cells, salt);
  let c = shoreHash(cell + vec2i(0, 1), cells, salt);
  let d = shoreHash(cell + vec2i(1, 1), cells, salt);
  let twist = a - b - c + d;
  let value = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  let gradient = vec2f(du.x * (b - a + twist * u.y), du.y * (c - a + twist * u.x));
  return vec3f(value * 2.0 - 1.0, gradient * 2.0 / size);
}

// Where `rest` falls in the shore field's texture.
fn shoreFieldUV(rest: vec2f) -> vec2f {
  return (rest - waves.shoreSize.yz) / waves.shoreSize.w + 0.5;
}

struct ShoreState {
  // 0..1: how strongly the shore waves show; 0 where they do not.
  fade : f32,
  // Seconds per metre the crests take; |∇T|.
  slowness : f32,
  // The way the crests travel, toward the coast.
  toCoast : vec2f,
  // 0..1: how near breaking.
  breaking : f32,
  // Metres crest to trough, faded and varied.
  height : f32,
  variation : f32,
  // Crest bend in radians, and its gradient per metre.
  wobble : vec3f,
}

// The shore waves over water `depth` deep at `rest`, from its shore field
// texel.
fn shoreState(shore: vec4f, rest: vec2f, depth: f32) -> ShoreState {
  var out: ShoreState;
  out.fade = 0.0;
  out.slowness = length(shore.yz);
  out.toCoast = vec2f(0.0);
  out.breaking = 0.0;
  out.height = 0.0;
  out.variation = 0.0;
  out.wobble = vec3f(0.0);
  let fade = (1.0 - smoothstep(SHORE_FADE_SHALLOW, SHORE_FADE_DEEP, depth)) * shore.w;
  if (fade <= 0.0 || depth <= 0.0 || waves.shoreSize.x <= 0.0 || out.slowness < 1e-4) {
    return out;
  }
  out.fade = fade;
  out.toCoast = shore.yz / out.slowness;
  let open = waves.shoreSize.x * pow(SHORE_REF_DEPTH / max(depth, 0.05), 0.25);
  let limit = BREAK_INDEX * depth;
  out.breaking = smoothstep(0.6, 1.0, open / max(limit, 1e-3));
  out.variation = mix(SHORE_LOW, 1.0, shoreNoise(rest, SHORE_NOISE_CELL, SHORE_NOISE_CELLS, 1u).x * 0.5 + 0.5);
  out.height = min(open, limit) * fade * out.variation;
  out.wobble = shoreNoise(rest, SHORE_NOISE_CELL, SHORE_NOISE_CELLS, 0u) * SHORE_WOBBLE;
  return out;
}

// Train `i`'s phase at a point `seconds` from deep water with crest bend
// `wobble`: its crest passes at 0 mod 2π.
fn shorePhase(i: i32, seconds: f32, wobble: f32) -> f32 {
  return waves.shore[i + 2] - waves.shore[i] * seconds + wobble;
}

// Swash: after a shore wave breaks, a sheet of water runs up the beach and
// drains back. The two trains beat into one wave whose height swells and fades
// over a set. Each time its crest reaches the waterline, the sheet's edge
// climbs RUNUP_RATIO of the breaker height, times that wave's share of the
// set's biggest. The uprush takes SWASH_UPRUSH of the wave and eases out; the
// backwash eases in. The host samples the swash field (ShoreField) itself.
const RUNUP_RATIO: f32 = 0.4;
const SWASH_UPRUSH: f32 = 0.3;

struct SwashState {
  // Metres above the level the sheet's edge stands now.
  edge : f32,
  // Metres above the level this wave runs up to.
  runup : f32,
  // Metres above the level the biggest wave of a set runs up to.
  highest : f32,
  // 0..1 through the wave: 0 as its crest reaches the waterline.
  cycle : f32,
  // Seconds a wave takes.
  period : f32,
}

// How high the sheet's edge stands `cycle` of the way through a wave that runs
// up to `runup`.
fn swashEdge(runup: f32, cycle: f32) -> f32 {
  var u = 1.0 - cycle / SWASH_UPRUSH;
  if (cycle >= SWASH_UPRUSH) {
    u = (cycle - SWASH_UPRUSH) / (1.0 - SWASH_UPRUSH);
  }
  return runup * (1.0 - u * u);
}

// The swash at `rest` from its swash field texel: x the seconds a wave takes
// to get to the nearest water it reaches, y its strength there.
fn swashState(field: vec2f, rest: vec2f) -> SwashState {
  var out: SwashState;
  out.edge = 0.0;
  out.runup = 0.0;
  out.highest = 0.0;
  out.cycle = 0.0;
  out.period = 1.0;
  let reach = field.y * waves.swash.x;
  if (reach <= 0.0 || waves.shoreSize.x <= 0.0) {
    return out;
  }
  let wobble = shoreNoise(rest, SHORE_NOISE_CELL, SHORE_NOISE_CELLS, 0u).x * SHORE_WOBBLE;
  let variation = mix(SHORE_LOW, 1.0, shoreNoise(rest, SHORE_NOISE_CELL, SHORE_NOISE_CELLS, 1u).x * 0.5 + 0.5);
  let shares = SHORE_TRAIN_SHARE / (SHORE_TRAIN_SHARE.x + SHORE_TRAIN_SHARE.y);
  let a = shorePhase(0, field.x, wobble);
  let b = shorePhase(1, field.x, wobble);
  let sum = shares.x * vec2f(cos(a), sin(a)) + shares.y * vec2f(cos(b), sin(b));
  out.highest = RUNUP_RATIO * waves.shoreSize.x * variation * reach;
  out.runup = out.highest * length(sum);
  out.cycle = fract(atan2(sum.y, sum.x) / 6.2831853);
  out.period = 6.2831853 / dot(shares, waves.shore.xy);
  out.edge = swashEdge(out.runup, out.cycle);
  return out;
}

// Lapping: where no shore waves reach, the wind's short chop runs up the shore
// as one train (ShoreWaves). Its phase drifts by up to LAKE_WOBBLE radians
// over LAKE_NOISE_CELL metre noise, so the sheet does not rise all round a
// lake at once, and its runup varies down to SHORE_LOW.
const LAKE_NOISE_CELL: f32 = 16.0;
const LAKE_NOISE_CELLS: i32 = 64;
const LAKE_WOBBLE: f32 = 6.2831853;

// The lapping at `rest` over water that laps `response` (0..1) strongly.
fn lakeSwashState(rest: vec2f, response: f32) -> SwashState {
  var out: SwashState;
  out.edge = 0.0;
  out.runup = 0.0;
  out.highest = 0.0;
  out.cycle = 0.0;
  out.period = 1.0;
  let reach = response * waves.swash.x;
  if (reach <= 0.0 || waves.lake.z <= 0.0) {
    return out;
  }
  let wobble = shoreNoise(rest, LAKE_NOISE_CELL, LAKE_NOISE_CELLS, 4u).x * LAKE_WOBBLE;
  let variation = mix(SHORE_LOW, 1.0, shoreNoise(rest, LAKE_NOISE_CELL, LAKE_NOISE_CELLS, 5u).x * 0.5 + 0.5);
  out.highest = waves.lake.z * variation * reach;
  out.runup = out.highest;
  out.cycle = fract((waves.lake.y + wobble) / 6.2831853);
  out.period = 6.2831853 / waves.lake.x;
  out.edge = swashEdge(out.runup, out.cycle);
  return out;
}

// The swash at `rest` over water with palette `weights`: the ocean's from its
// swash field texel `field` (see swashState) where its shore waves reach, as
// only water that takes the longest cascade, the open sea's, has them; else
// the lapping.
fn waterSwash(field: vec2f, rest: vec2f, weights: vec4f) -> SwashState {
  let ocean = swashState(vec2f(field.x, field.y * dot(waves.cascadeTypes[0], weights)), rest);
  if (ocean.highest > 0.0) {
    return ocean;
  }
  return lakeSwashState(rest, dot(waves.lakeTypes, weights));
}

// Seconds since the sheet last drained off ground `above` metres over the
// level: 0 while it covers it, 1e4 where this wave does not reach it.
fn swashDrained(swash: SwashState, above: f32) -> f32 {
  if (above <= 0.0) {
    return 0.0;
  }
  if (above >= swash.runup) {
    return 1e4;
  }
  let rise = sqrt(1.0 - above / swash.runup);
  let arrives = SWASH_UPRUSH * (1.0 - rise);
  let leaves = SWASH_UPRUSH + (1.0 - SWASH_UPRUSH) * rise;
  if (swash.cycle >= arrives && swash.cycle <= leaves) {
    return 0.0;
  }
  return fract(swash.cycle - leaves) * swash.period;
}
