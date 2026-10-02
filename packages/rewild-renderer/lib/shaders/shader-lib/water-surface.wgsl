// Where the waves move a point of the water surface: the FFT ocean's cascades,
// the shore trains and the swash, held by the depth. The water's vertices and
// the water probe both displace by `surfaceDisplacement`, so a probe reads the
// surface that is drawn. The host includes water-waves.wgsl and
// shore-waves.wgsl, and declares `waves : Waves`, `shoreMap`, `swashMap` and
// `surfaceSampler` (ShoreField), and `oceanDisplacement` and `oceanSampler`
// (OceanFFT).

// Texels per side of a cascade's tile.
const FFT_N: f32 = 256.0;
// Metres before each LOD distance over which the spacing ramps to the coarser
// grid's, so the mip a vertex samples never jumps.
const LOD_RAMP: f32 = 60.0;
// Mips a vertex samples above the one matching its grid spacing, so no wave
// shorter than the grid can hold displaces it.
const VERTEX_MIP_BIAS: f32 = 0.7;
// Troughs ease toward a floor at TROUGH_FLOOR of the depth, so no rare deep
// trough reaches the bed. See SHOAL_RATIO.
const TROUGH_FLOOR: f32 = 0.8;

// How far the shore trains (shore-waves.wgsl) pull water toward their crests: CHOP × their height,
// bounded so the summed steepness stays under STEEP_OPEN out at sea and
// STEEP_BREAK where they break, both below 1 so a crest never folds.
const SHORE_CHOP_OPEN: f32 = 1.0;
const SHORE_CHOP_BREAK: f32 = 2.0;
const SHORE_STEEP_OPEN: f32 = 0.35;
const SHORE_STEEP_BREAK: f32 = 0.9;
// Most of the depth's height budget the shore waves take from the open sea,
// so some chop always rides between them.
const SHORE_BUDGET_SHARE: f32 = 0.8;
// Breaker foam: where a shore wave breaks it gathers over the last
// SHORE_FOAM_AHEAD of a cycle before the crest and trails behind it, fading by
// e every 1 / SHORE_FOAM_TRAIL of a cycle.
const SHORE_FOAM_AHEAD: f32 = 0.06;
const SHORE_FOAM_TRAIL: f32 = 5.0;
const SHORE_FOAM_AMOUNT: f32 = 1.3;
// Swash (shore-waves.wgsl): the surface lifts by the sheet's edge height at
// the waterline, fading out by SWASH_DEPTH metres of depth, and the terrain's
// depth test cuts the sheet's edge.
const SWASH_DEPTH: f32 = 1.5;

// How strongly each cascade moves this water: the palette's weights, then
// what the depth holds once the shore waves have taken `taken` of its height
// variance, up to SHORE_BUDGET_SHARE of it. The budget goes to the shortest
// cascades first, so shallow water loses its long heave and keeps its chop.
fn cascadeScales(weights: vec4f, depth: f32, taken: f32) -> vec4f {
  let limit = SHOAL_RATIO * depth * 0.25;
  let capacity = limit * limit;
  var budget = capacity - min(taken, capacity * SHORE_BUDGET_SHARE);
  var scales = vec4f(0.0);
  for (var c: i32 = CASCADES - 1; c >= 0; c--) {
    let w = dot(waves.cascadeTypes[c], weights);
    let rms = waves.cascade[c].y * w;
    let variance = rms * rms;
    let held = select(1.0, sqrt(saturate(budget / variance)), variance > 1e-8);
    scales[c] = w * held;
    budget = max(budget - variance * held * held, 0.0);
  }
  return scales;
}

// Eases a trough toward the floor below which it would near the bed.
fn floorTrough(height: f32, depth: f32) -> f32 {
  let lowest = max(TROUGH_FLOOR * depth, 1e-3);
  return select(height, -lowest * tanh(-height / lowest), height < 0.0);
}

struct ShoreWave {
  displacement : vec3f,
  // dDy/dx, dDy/dz, dDx/dx, dDz/dz, as the ocean's slopes.
  slopes : vec4f,
  // Height variance it adds, which the open sea gives up.
  variance : f32,
  // 0..1: foam coverage from the breakers, before its breakup.
  foam : f32,
}

// The shore field at `rest`.
fn sampleShore(rest: vec2f) -> vec4f {
  return textureSampleLevel(shoreMap, surfaceSampler, shoreFieldUV(rest), 0.0);
}

// The swash at `rest` over water with palette `weights` (see waterSwash).
fn sampleSwash(rest: vec2f, weights: vec4f) -> SwashState {
  let field = textureSampleLevel(swashMap, surfaceSampler, shoreFieldUV(rest), 0.0).xy;
  return waterSwash(field, rest, weights);
}

// The shore waves at `rest` over water `depth` deep. A train shorter than
// 4 × `resolution` metres fades out, so a coarse grid or a distant pixel does
// not alias it.
fn shoreWave(rest: vec2f, depth: f32, resolution: f32) -> ShoreWave {
  var out: ShoreWave;
  out.displacement = vec3f(0.0);
  out.slopes = vec4f(0.0);
  out.variance = 0.0;
  out.foam = 0.0;
  let shore = sampleShore(rest);
  let state = shoreState(shore, rest, depth);
  if (state.fade <= 0.0) {
    return out;
  }
  let slowness = state.slowness;
  let toCoast = state.toCoast;
  let breaking = state.breaking;
  let height = state.height;
  let wobble = state.wobble;
  let chop = mix(SHORE_CHOP_OPEN, SHORE_CHOP_BREAK, breaking);
  let steep = mix(SHORE_STEEP_OPEN, SHORE_STEEP_BREAK, breaking);
  let trains = SHORE_TRAIN_SHARE;
  let shares = trains / (trains.x + trains.y);

  for (var i: i32 = 0; i < 2; i++) {
    let omega = waves.shore[i];
    let k = omega * slowness;
    let resolved = 1.0 - smoothstep(0.125, 0.25, resolution * k / 6.2831853);
    let phase = shorePhase(i, shore.x, wobble.x);
    // Where in its cycle the crest is: 0 as it passes, rising behind it.
    let cycle = fract(phase / 6.2831853);
    let behind = exp(-cycle * SHORE_FOAM_TRAIL);
    let ahead = smoothstep(1.0 - SHORE_FOAM_AHEAD, 1.0, cycle);
    out.foam += shares[i] * max(behind, ahead);
    let amplitude = height * trains[i] * resolved;
    if (amplitude <= 0.0) {
      continue;
    }
    let reach = min(amplitude * chop, steep * shares[i] / k);
    let gradient = wobble.yz - omega * shore.yz;
    let s = sin(phase);
    let c = cos(phase);
    out.displacement += vec3f(toCoast.x * reach * s, amplitude * c, toCoast.y * reach * s);
    out.slopes += vec4f(
      -amplitude * s * gradient.x,
      -amplitude * s * gradient.y,
      toCoast.x * reach * c * gradient.x,
      toCoast.y * reach * c * gradient.y
    );
    out.variance += amplitude * amplitude * 0.5;
  }
  out.foam = saturate(out.foam * breaking * state.fade * state.variation * SHORE_FOAM_AMOUNT);
  return out;
}

// The coarsest grid spacing the LOD system can put at `distance` from the
// viewer, ramped in before each LOD distance. Two chunks meeting at a vertex
// see the same distance, so they displace it from the same mip whatever their
// own grids, and the seam between two resolutions does not crack.
fn gridSpacingAt(distance: f32) -> f32 {
  var spacing = waves.grid.x;
  for (var i: i32 = 0; i < 8; i++) {
    let limit = waves.lodDistance[i / 4][i % 4];
    if (limit <= 0.0) {
      break;
    }
    let ramp = smoothstep(limit - LOD_RAMP, limit, distance);
    spacing = mix(spacing, waves.lodSpacing[i / 4][i % 4], ramp);
  }
  return spacing;
}

// The grid spacing the water at `rest` is drawn with, its surface standing at
// world height `level`.
fn surfaceSpacing(rest: vec2f, level: f32) -> f32 {
  // Distance from the viewer's ground point, as chunk LODs measure it.
  let fromEye = vec3f(rest.x - waves.view.z, level, rest.y - waves.view.w);
  return gridSpacingAt(length(fromEye));
}

struct SurfaceMove {
  // Metres the waves move the point, sideways as well as up.
  displacement : vec3f,
  // Metres the swash sheet lifts it on top.
  lift : f32,
}

// How the waves move the surface at `rest`, over water `depth` deep with
// palette `weights`, on a grid `spacing` metres apart: each cascade sampled at
// the mip the grid can hold, plus the shore waves and the swash.
fn surfaceDisplacement(rest: vec2f, depth: f32, weights: vec4f, spacing: f32) -> SurfaceMove {
  let shore = shoreWave(rest, depth, spacing);
  let scales = cascadeScales(weights, depth, shore.variance);

  var displacement = shore.displacement;
  if (depth > 0.0) {
    for (var c: i32 = 0; c < CASCADES; c++) {
      let w = scales[c];
      if (w <= 0.0) {
        continue;
      }
      let texel = waves.cascade[c].x / FFT_N;
      let level = max(log2(spacing / texel) + VERTEX_MIP_BIAS, 0.0);
      let s = textureSampleLevel(oceanDisplacement, oceanSampler, cascadeUV(c, rest), c, level);
      displacement += s.xyz * w;
    }
    displacement.y = floorTrough(displacement.y, depth);
  }
  let swash = sampleSwash(rest, weights);

  var out: SurfaceMove;
  out.displacement = displacement;
  out.lift = swash.edge * (1.0 - smoothstep(0.0, SWASH_DEPTH, depth));
  return out;
}
