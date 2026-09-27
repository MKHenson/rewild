// Water is drawn twice per chunk. `fs_absorb` multiplies the scene behind by
// what survives the trip through the water, per channel; `fs_light` then adds
// what the surface reflects and what the water scatters back. Together they
// give Beer-Lambert depth colour over the real bed without a copy of the scene.

const HAS_FOLIAGE_SHADING: bool = false;

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"
#include "./shader-lib/scatter-wind.wgsl"

// Air to water at normal incidence.
const WATER_F0: f32 = 0.02;

// Floor on N·V for the slant path through the water, so a grazing view does
// not read as infinitely deep.
const MIN_PATH_NOV: f32 = 0.1;

// Air over water's index of refraction.
const AIR_TO_WATER: f32 = 0.75;
// Metres the refracted ray is followed down, at most, to find how far the
// waves bend it on screen. Shallow water bends it less, so the offset fades
// out at the shore.
const REFRACTION_REACH: f32 = 3.0;

// Foam. Whitecaps stand where the surface is unusually high for its waves: a
// z-score of the height over octaves this long and up, so where many crest
// together. Below FOAM_WIND_START there are none; the z it takes falls from
// WHITECAP_Z_CALM to WHITECAP_Z_GALE as the wind rises.
const WHITECAP_MIN_LENGTH: f32 = 2.0;
const FOAM_WIND_START: f32 = 0.3;
const WHITECAP_Z_CALM: f32 = 3.0;
const WHITECAP_Z_GALE: f32 = 1.1;
const WHITECAP_Z_SOFTNESS: f32 = 0.6;
// Foam lingers where a crest broke, fading as the crest moves on. The waves
// are a function of time, so the vertex stage finds the whitecaps of
// FOAM_LINGER_SAMPLES past moments, FOAM_LINGER_FIRST × (k + 1)^1.3 seconds
// ago (0.7 s to 4.3 s), each faded by exp(−age / FOAM_LIFETIME).
const FOAM_LINGER_SAMPLES: i32 = 4;
const FOAM_LINGER_FIRST: f32 = 0.7;
const FOAM_LIFETIME: f32 = 16.0;
// Standard deviation of exp(sin θ − 1), for the z-score.
const WAVE_HEIGHT_STD: f32 = 0.30266;
// Streaks along the wind from this strength up, faint and in patches the
// gust field carries downwind. They sample a blurrier mip, so they read as
// soft lines rather than cut ones.
const STREAK_WIND_START: f32 = 0.75;
const STREAK_COVERAGE: f32 = 0.5;
const STREAK_OPACITY: f32 = 0.35;
const STREAK_MIP_BIAS: f32 = 1.5;
// Metres per repeat of the foam texture: two tilings, one turned, to hide the
// repeat, and a stretched one for streaks. Each divides FOAM_DRIFT_PERIOD, so
// the drift wraps without a jump.
const FOAM_TILE_A: f32 = 8.0;
const FOAM_TILE_B: f32 = 12.8;
const STREAK_LENGTH: f32 = 64.0;
const STREAK_WIDTH: f32 = 4.0;
// cos and sin of the turn of the second tiling.
const FOAM_TURN: vec2f = vec2f(0.7986355, 0.6018150);
// Texture density over which coverage fades foam in.
const FOAM_SOFTNESS: f32 = 0.25;
// Opacity of the thinnest foam the texture shows; its densest clumps are
// opaque, so bubbles and thin spots show the water through.
const FOAM_THIN: f32 = 0.15;
// Opacity of all foam.
const FOAM_OPACITY: f32 = 0.9;
// Opacity lingering foam fades to as it dies: fresh foam is opaque, and it
// turns translucent as well as thinning out with age.
const FOAM_AGED_OPACITY: f32 = 0.2;
const FOAM_ALBEDO: f32 = 0.65;
const FOAM_ROUGHNESS: f32 = 0.6;

const MAX_WATER_TYPES: u32 = 4u;

// Wave octaves, from WaterWaves.ts, longest first.
const WAVE_COUNT: i32 = 40;
const TWO_PI: f32 = 6.2831853;
// Mean of exp(sin θ − 1), so the surface averages to the water level.
const WAVE_MEAN: f32 = 0.46575961;
// An octave shorter than this many grid spacings shades only: the grid cannot
// hold its shape, so displacing by it would alias. Matches gridResolve.
// Metres before each LOD distance over which the spacing ramps to the coarser
// grid's, so the waves a vertex takes never jump.
const LOD_RAMP: f32 = 60.0;
const RESOLVE_FROM: f32 = 4.0;
const RESOLVE_TO: f32 = 8.0;
// Depth in metres over which waves die down toward the waterline.
const SHORE_CALM_DEPTH: f32 = 1.5;
// An octave's normal fades out as its wavelength shrinks from this many pixels
// to this many on screen, the tier scaling the count, before it aliases into
// sparkles. The pixel footprint grows at a grazing view, so these fade sooner
// there than straight down.
const NORMAL_FADE_FULL_PIXELS: f32 = 8.0;
const NORMAL_FADE_GONE_PIXELS: f32 = 3.0;
// An octave steeper than this k·A is summed; any flatter one is skipped
// without trig, and does not count toward the tier's octave budget.
const SILENT_STEEPNESS: f32 = 0.002;
// Mean of (exp(sin θ − 1)·cos θ)² over a cycle, e⁻²·I1(2)/2: an octave's slope
// variance per unit (k·A)².
const SLOPE_VARIANCE: f32 = 0.10763;
// Cat's paws: the foliage gust field scales the ripples between a lull and a
// gust, fully so from this wind strength up. Only octaves too short for any
// grid to displace take part, so the surface the CPU queries is untouched.
const GUST_LULL: f32 = 0.5;
const GUST_PEAK: f32 = 1.8;
const GUST_FULL_STRENGTH: f32 = 0.5;
// Large-scale variation, matching WaterWaves.variation: a swell and a chop
// field, each blended into an octave by its length.
const SWELL_SCALE_A: f32 = 760.0;
const SWELL_SCALE_B: f32 = 280.0;
const CHOP_SCALE_A: f32 = 430.0;
const CHOP_SCALE_B: f32 = 150.0;
const VARIATION_WEIGHT_A: f32 = 0.65;
const VARIATION_WEIGHT_B: f32 = 0.35;
const VARIATION_CONTRAST_LOW: f32 = 0.3;
const VARIATION_CONTRAST_HIGH: f32 = 0.7;
const SWELL_LOW: f32 = 0.35;
const SWELL_HIGH: f32 = 1.35;
const CHOP_LOW: f32 = 0.08;
const CHOP_HIGH: f32 = 1.45;
// log(2π / 120 m) and log(120 m / 0.15 m): octaveBand's span, from the longest
// octave to the shortest.
const LOG_K_LONGEST: f32 = -2.9496681;
const LOG_K_SPAN: f32 = 6.6846117;
// Octaves each draw's normal sums, from the water quality tier.
const NORMAL_OCTAVES: i32 = ${ NORMAL_OCTAVES };
const ABSORB_OCTAVES: i32 = ${ ABSORB_OCTAVES };

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct WaterParams {
  // Texels per side of the water map.
  texels : f32,
  roughness : f32,
  // The chunk's centre in world xz; waves are summed in world space.
  originX : f32,
  originZ : f32,
  // Per palette entry: linear colour scattered back out of deep water.
  scatter : array<vec4f, 4>,
  // Per palette entry: rgb absorption per metre, a = turbidity per metre.
  extinction : array<vec4f, 4>,
  // World height the level and terrain heights are relative to.
  baseLevel : f32,
}

struct Waves {
  // Seconds on the looping wave clock.
  time : f32,
  // Scale on each octave's normal fade distances.
  normalFade : f32,
  // The viewer's xz, from the wave origin, where chunk LODs were chosen.
  eye : vec2f,
  // xy: the world xz the phases are taken from, near the camera, so trig
  // arguments stay small.
  origin : vec4f,
  // Per palette type: how hard each octave drags the next.
  drag : vec4f,
  // The variation noise's drift in lattice cells: [0] the swell field's
  // octaves A xy and B zw, [1] the chop field's.
  variation : array<vec4f, 2>,
  // The foliage wind: direction the air moves xz, strength, clock in
  // full-wind seconds. Its gust field ruffles the ripples.
  wind : vec4f,
  // Chunk-edge distances past which a coarser grid can appear, and that grid's
  // spacing in metres; unused entries are 0. See waterGridBands.
  lodDistance : array<vec4f, 2>,
  lodSpacing : array<vec4f, 2>,
  // x: the finest grid's spacing, used nearer than the first distance. yz:
  // metres the foam has drifted downwind, wrapped.
  grid : vec4f,
  // Per octave: direction xz, wavenumber, angular frequency.
  wave : array<vec4f, 40>,
  // Per octave: amplitude in metres for each palette type.
  amp : array<vec4f, 40>,
  // Per octave: starting phase, four to a vec4.
  phase : array<vec4f, 10>,
}

struct VertexInput {
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
}

struct VertexOutput {
  // Invariant, so the depth draw and the two shading draws agree exactly.
  @builtin(position) @invariant Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) viewPosition : vec3f,
  // xz the vertex rests at before the waves move it, from the wave origin.
  @location(2) rest : vec2f,
  // The height gradient of the octaves the grid holds here, which the pixel
  // shader adds to its own.
  @location(3) slope : vec2f,
  // How far those octaves dragged the point the shorter ones sample.
  @location(4) dragged : vec2f,
  // The grid spacing the octaves were split by, in metres.
  @location(5) spacing : f32,
  // Those octaves' height and summed squared amplitude, for the whitecaps.
  @location(6) crest : vec2f,
  // Foam coverage left by whitecaps that broke here in the last seconds.
  @location(7) linger : f32,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var surfaceSampler : sampler;
// (level, terrain height, coverage, _) relative to the base level, which the
// mesh transform carries.
@group(1) @binding(1) var surfaceMap : texture_2d<f32>;
@group(1) @binding(2) var<uniform> params : WaterParams;
// Weights over the water palette.
@group(1) @binding(3) var typeMap : texture_2d<f32>;
@group(1) @binding(4) var<uniform> waves : Waves;
// The opaque scene behind the water (RefractionCapture): rgb colour, a view
// depth in metres. Bound for the absorb draw only.
@group(1) @binding(5) var refraction : texture_2d<f32>;
// Tileable foam, white against transparent (WaterTextures), and a repeating
// sampler. Bound for the absorb and light draws.
@group(1) @binding(6) var foamTexture : texture_2d<f32>;
@group(1) @binding(7) var foamSampler : sampler;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;
@group(3) @binding(0) var cloudShadowMap: texture_2d<f32>;
@group(3) @binding(1) var cloudShadowSampler: sampler;
@group(3) @binding(2) var<uniform> cloudShadowParams: CloudShadowParams;
@group(3) @binding(3) var shadowAtlas: texture_depth_2d;
@group(3) @binding(4) var shadowSampler: sampler_comparison;
@group(3) @binding(5) var<uniform> directionalShadowParams: DirectionalShadowParams;
@group(3) @binding(6) var<uniform> spotLightShadowParams: SpotLightShadowParams;
@group(3) @binding(7) var iblIrradianceMap: texture_cube<f32>;
@group(3) @binding(8) var iblSpecularMap: texture_cube<f32>;
@group(3) @binding(9) var iblBrdfLut: texture_2d<f32>;
@group(3) @binding(10) var iblSampler: sampler;
@group(3) @binding(11) var<uniform> iblParams: IblParams;

// Texels sit on the grid's vertices, so uv 0 and 1 land on texel centres.
fn surfaceUV(uv: vec2f) -> vec2f {
  return (uv * (params.texels - 1.0) + 0.5) / params.texels;
}

struct WaterSample {
  coverage : f32,
  depth : f32,
  weights : vec4f,
  scatter : vec3f,
  extinction : vec3f,
  // 0..1: how much crest foam the wind raises.
  foam : f32,
}

// Type weights summing to 1; a texel with none reads as the first type.
fn normalizeWeights(weights: vec4f) -> vec4f {
  let total = weights.x + weights.y + weights.z + weights.w;
  return select(vec4f(1.0, 0.0, 0.0, 0.0), weights / total, total > 1e-4);
}

fn sampleWater(uv: vec2f) -> WaterSample {
  let suv = surfaceUV(uv);
  let surface = textureSample(surfaceMap, surfaceSampler, suv);
  let weights = normalizeWeights(textureSample(typeMap, surfaceSampler, suv));

  var out: WaterSample;
  out.coverage = surface.b;
  out.depth = max(surface.r - surface.g, 0.0);
  out.weights = weights;
  out.scatter = vec3f(0.0);
  out.extinction = vec3f(0.0);
  out.foam = 0.0;
  for (var i: u32 = 0u; i < MAX_WATER_TYPES; i++) {
    let e = params.extinction[i];
    out.scatter += params.scatter[i].rgb * weights[i];
    out.foam += params.scatter[i].a * weights[i];
    out.extinction += (e.rgb + vec3f(e.a)) * weights[i];
  }
  return out;
}

fn latticeValue(ix: i32, iy: i32) -> f32 {
  var h = u32(ix & 255) * 0x9e3779b1u;
  h = (h ^ u32(iy & 255)) * 0x85ebca6bu;
  h = (h ^ (h >> 16u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  let ix = i32(i.x);
  let iy = i32(i.y);
  let a = latticeValue(ix, iy);
  let b = latticeValue(ix + 1, iy);
  let c = latticeValue(ix, iy + 1);
  let d = latticeValue(ix + 1, iy + 1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn variationField(p: vec2f, scaleA: f32, scaleB: f32, drift: vec4f, low: f32, high: f32) -> f32 {
  let n = VARIATION_WEIGHT_A * valueNoise(p / scaleA + drift.xy)
        + VARIATION_WEIGHT_B * valueNoise(p / scaleB + drift.zw);
  return mix(low, high, smoothstep(VARIATION_CONTRAST_LOW, VARIATION_CONTRAST_HIGH, n));
}

// Scales the waves over hundreds of metres, so no two stretches look alike:
// x scales the swell, y the chop.
fn waveVariation(world: vec2f) -> vec2f {
  return vec2f(
    variationField(world, SWELL_SCALE_A, SWELL_SCALE_B, waves.variation[0], SWELL_LOW, SWELL_HIGH),
    variationField(world, CHOP_SCALE_A, CHOP_SCALE_B, waves.variation[1], CHOP_LOW, CHOP_HIGH)
  );
}

// An octave's scale from the variation: the swell field's for the longest,
// the chop field's for the shortest.
fn octaveVariation(variation: vec2f, k: f32) -> f32 {
  return mix(variation.x, variation.y, clamp((log(k) - LOG_K_LONGEST) / LOG_K_SPAN, 0.0, 1.0));
}

// An octave's phase at `p`, measured from the wave origin and wrapped into
// 0..2π: GPU sin and cos are only accurate over a small range.
fn wavePhase(i: i32, p: vec2f) -> f32 {
  return wavePhaseAt(i, p, waves.time);
}

// An octave's phase at `p` at `time` on the wave clock. Every frequency loops
// over the clock, so a time before its wrap is still continuous.
fn wavePhaseAt(i: i32, p: vec2f, time: f32) -> f32 {
  let w = waves.wave[i];
  let theta = w.z * dot(w.xy, p) - w.w * time + waves.phase[i / 4][i % 4];
  return theta - TWO_PI * floor(theta / TWO_PI);
}

// The coarsest grid spacing the LOD system can put at `distance` from the
// viewer, ramped in before each LOD distance. Two chunks meeting at a vertex
// see the same distance, so they displace it by the same waves whatever their
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

// Waves die down toward the waterline rather than lifting water over the sand.
fn shoreCalm(depth: f32) -> f32 {
  return smoothstep(0.0, SHORE_CALM_DEPTH, depth);
}

// How much of an octave of wavenumber `k` a grid of `spacing` metres holds.
// The vertex stage displaces and shades by that share; the pixel stage
// shades by the rest. Matches gridResolve.
fn resolvedBy(spacing: f32, k: f32) -> f32 {
  return smoothstep(RESOLVE_FROM * spacing, RESOLVE_TO * spacing, TWO_PI / k);
}

struct GeometryWaves {
  height : f32,
  slope : vec2f,
  // Summed squared amplitude.
  energy : f32,
  // `rest` less the point the first octave the grid cannot hold samples.
  dragged : vec2f,
}

// The height at `rest` from the octaves the grid can hold, as
// WaterWaves.height sums it, and their gradient. Each octave drags the point
// the next samples. The drag's bending of the gradient is left out; it barely
// shows and would triple the cost.
fn geometryWaves(rest: vec2f, weights: vec4f, gain: vec2f, spacing: f32) -> GeometryWaves {
  let drag = dot(waves.drag, weights);
  var p = rest;
  var out: GeometryWaves;
  out.height = 0.0;
  out.slope = vec2f(0.0);
  out.energy = 0.0;
  for (var i: i32 = 0; i < WAVE_COUNT; i++) {
    let w = waves.wave[i];
    let resolved = resolvedBy(spacing, w.z);
    if (resolved <= 0.0) {
      break;
    }
    let amplitude = dot(waves.amp[i], weights) * octaveVariation(gain, w.z) * resolved;
    let theta = wavePhase(i, p);
    let e = exp(sin(theta) - 1.0);
    let ec = e * cos(theta);
    out.height += amplitude * (e - WAVE_MEAN);
    out.slope += w.xy * (amplitude * ec * w.z);
    out.energy += amplitude * amplitude;
    p -= w.xy * (drag * amplitude * ec);
  }
  out.dragged = rest - p;
  return out;
}

struct WaveNormal {
  // View space.
  normal : vec3f,
  // Slope variance of the octaves too small on screen, or past the tier's
  // budget, to sum: widens the highlight instead of letting it sparkle.
  variance : f32,
  // How unusually high the surface stands: its height over the octaves at
  // least WHITECAP_MIN_LENGTH long, in standard deviations.
  crest : f32,
}

// Metres of water surface one pixel covers at `rest`. Taken before any
// discard, where derivatives are still defined.
fn pixelFootprint(rest: vec2f) -> f32 {
  return max(length(dpdx(rest)), length(dpdy(rest)));
}

// How much the gust field scales the ripples at world xz.
fn gustScale(world: vec2f) -> f32 {
  let gust = smoothstep(0.35, 0.65, gustField(world, waves.wind));
  return mix(1.0, mix(GUST_LULL, GUST_PEAK, gust), min(waves.wind.z / GUST_FULL_STRENGTH, 1.0));
}

// The height at `rest`, `age` seconds ago, of the octaves the grid holds, as
// geometryWaves sums it.
fn pastHeight(rest: vec2f, weights: vec4f, gain: vec2f, spacing: f32, age: f32) -> f32 {
  let drag = dot(waves.drag, weights);
  let time = waves.time - age;
  var p = rest;
  var height = 0.0;
  for (var i: i32 = 0; i < WAVE_COUNT; i++) {
    let w = waves.wave[i];
    let resolved = resolvedBy(spacing, w.z);
    if (resolved <= 0.0) {
      break;
    }
    let amplitude = dot(waves.amp[i], weights) * octaveVariation(gain, w.z) * resolved;
    let theta = wavePhaseAt(i, p, time);
    let e = exp(sin(theta) - 1.0);
    height += amplitude * (e - WAVE_MEAN);
    p -= w.xy * (drag * amplitude * e * cos(theta));
  }
  return height;
}

// How far the wind has come toward raising foam, 0..1.
fn foamWind() -> f32 {
  return smoothstep(FOAM_WIND_START, 1.0, waves.wind.z);
}

// Whitecap coverage for a crest z-score.
fn whitecap(z: f32) -> f32 {
  let capZ = mix(WHITECAP_Z_CALM, WHITECAP_Z_GALE, foamWind());
  return smoothstep(capZ, capZ + WHITECAP_Z_SOFTNESS, z);
}

// The surface normal at a pixel: the vertex stage's gradient from the octaves
// the grid holds, plus up to `octaves` of the rest summed here, each fading
// out before it aliases. The budget goes to the octaves the grid cannot hold,
// so every tier shows the fine ripples. The drag's bending of the gradient is
// left out; it barely shows and would triple the cost.
fn waterNormal(input: VertexOutput, water: WaterSample, footprint: f32, octaves: i32) -> WaveNormal {
  let rest = input.rest;
  let world = rest + waves.origin.xy;
  let gain = shoreCalm(water.depth) * waveVariation(world);
  let gust = gustScale(world);
  // No grid displaces an octave shorter than this; gusts reach it fully
  // below half of it.
  let shadeOnly = RESOLVE_FROM * waves.grid.x;
  let drag = dot(waves.drag, water.weights);
  var p = rest - input.dragged;
  var slope = input.slope;
  var variance = 0.0;
  var summed: i32 = 0;
  var crestHeight = input.crest.x;
  var crestEnergy = input.crest.y;
  for (var i: i32 = 0; i < WAVE_COUNT; i++) {
    let w = waves.wave[i];
    let wavelength = TWO_PI / w.z;
    let gusted = mix(gust, 1.0, smoothstep(0.5 * shadeOnly, shadeOnly, wavelength));
    let unresolved = 1.0 - resolvedBy(input.spacing, w.z);
    let steepness = dot(waves.amp[i], water.weights) * octaveVariation(gain, w.z) * w.z * gusted * unresolved;
    if (steepness < SILENT_STEEPNESS) {
      continue;
    }
    let pixels = wavelength / max(footprint, 1e-6) * waves.normalFade;
    var fade = smoothstep(NORMAL_FADE_GONE_PIXELS, NORMAL_FADE_FULL_PIXELS, pixels);
    if (summed >= octaves) {
      fade = 0.0;
    }
    variance += steepness * steepness * SLOPE_VARIANCE * (1.0 - fade * fade);
    if (fade <= 0.0) {
      continue;
    }
    summed++;
    let amplitude = steepness / w.z * fade;
    let theta = wavePhase(i, p);
    let e = exp(sin(theta) - 1.0);
    let ec = e * cos(theta);
    slope += w.xy * (amplitude * ec * w.z);
    p -= w.xy * (drag * amplitude * ec);
    if (wavelength >= WHITECAP_MIN_LENGTH) {
      crestHeight += amplitude * (e - WAVE_MEAN);
      crestEnergy += amplitude * amplitude;
    }
  }
  var out: WaveNormal;
  out.crest = crestHeight / max(WAVE_HEIGHT_STD * sqrt(crestEnergy), 1e-6);
  out.normal = normalize(uniforms.normalMatrix * vec3f(-slope.x, 1.0, -slope.y));
  out.variance = variance;
  return out;
}

// Light reaching the eye from the bed: down to it and back up the view ray.
fn waterTransmittance(water: WaterSample, NoV: f32) -> vec3f {
  let path = water.depth * (1.0 + 1.0 / max(NoV, MIN_PATH_NOV));
  return exp(-water.extinction * path);
}

fn waterFresnel(NoV: f32) -> f32 {
  return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - NoV, 5.0);
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  let suv = surfaceUV(input.uv);
  let surface = textureSampleLevel(surfaceMap, surfaceSampler, suv, 0.0);
  let weights = normalizeWeights(textureSampleLevel(typeMap, surfaceSampler, suv, 0.0));
  // Chunk origin less wave origin is exact in f32, so `rest` keeps its
  // precision however far the camera is from the world origin.
  let rest = vec2f(
    (params.originX - waves.origin.x) + input.position.x,
    (params.originZ - waves.origin.y) + input.position.z
  );

  // Everything here is a function of world position alone, so two chunks move
  // a shared edge vertex the same way.
  // Distance from the viewer's ground point, as chunk LODs measure it.
  let fromEye = vec3f(rest.x - waves.eye.x, params.baseLevel + surface.r, rest.y - waves.eye.y);
  let spacing = gridSpacingAt(length(fromEye));
  let calm = shoreCalm(max(surface.r - surface.g, 0.0));

  let gain = calm * waveVariation(rest + waves.origin.xy);

  var geometry: GeometryWaves;
  geometry.height = 0.0;
  geometry.slope = vec2f(0.0);
  geometry.energy = 0.0;
  geometry.dragged = vec2f(0.0);
  if (calm > 0.0) {
    geometry = geometryWaves(rest, weights, gain, spacing);
  }

  // The octaves' energy does not change with time, only their height.
  var linger = 0.0;
  if (geometry.energy > 0.0 && foamWind() > 0.0) {
    let spread = WAVE_HEIGHT_STD * sqrt(geometry.energy);
    for (var k: i32 = 0; k < FOAM_LINGER_SAMPLES; k++) {
      let age = FOAM_LINGER_FIRST * pow(f32(k + 1), 1.3);
      let z = pastHeight(rest, weights, gain, spacing, age) / spread;
      linger = max(linger, whitecap(z) * exp(-age / FOAM_LIFETIME));
    }
  }

  let local = vec4f(input.position.x, surface.r + geometry.height, input.position.z, 1.0);
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  out.rest = rest;
  // A normal fade of 0 is the debug switch for flat normals.
  out.slope = select(vec2f(0.0), geometry.slope, waves.normalFade > 0.0);
  out.dragged = geometry.dragged;
  out.spacing = spacing;
  out.crest = vec2f(geometry.height, geometry.energy);
  out.linger = linger;
  return out;
}

// Writes the nearest layer's depth, so the shading draws skip every layer the
// waves fold behind it. Discards exactly where they do.
@fragment
fn fs_depth(input: VertexOutput) {
  if (textureSample(surfaceMap, surfaceSampler, surfaceUV(input.uv)).b <= 0.0) {
    discard;
  }
}

// The foam texture's density at `uv`: brightness × alpha. Sampled at an
// explicit mip, from the pixel's footprint, so it may run after a discard.
fn foamDensity(uv: vec2f, footprint: f32, tile: f32, bias: f32) -> f32 {
  let size = f32(textureDimensions(foamTexture).x);
  let lod = log2(max(footprint * size / tile, 1.0)) + bias;
  let texel = textureSampleLevel(foamTexture, foamSampler, uv, lod);
  return texel.r * texel.a;
}

// Foam 0..1 where density passes 1 − coverage, so more coverage grows the
// patches out from the densest clumps.
fn foamFrom(density: f32, coverage: f32) -> f32 {
  let shown = smoothstep(1.0 - coverage, 1.0 - coverage + FOAM_SOFTNESS, density);
  return shown * mix(FOAM_THIN, 1.0, density);
}

// Foam at `world` xz: whitecaps where the surface stands high, thinner foam
// left around them, and streaks along the wind in a gale, each scaled by the
// palette's foam amount and drifting downwind.
fn waterFoam(world: vec2f, footprint: f32, crest: f32, linger: f32, water: WaterSample) -> f32 {
  if (water.foam <= 0.0) {
    return 0.0;
  }
  let drifted = world - waves.grid.yz;
  let amount = foamWind() * water.foam;

  let turned = vec2f(
    drifted.x * FOAM_TURN.x - drifted.y * FOAM_TURN.y,
    drifted.x * FOAM_TURN.y + drifted.y * FOAM_TURN.x
  );
  let density = 0.6 * foamDensity(drifted / FOAM_TILE_A, footprint, FOAM_TILE_A, 0.0)
              + 0.4 * foamDensity(turned / FOAM_TILE_B, footprint, FOAM_TILE_B, 0.0);
  // `linger` falls with age, so it sets both how much old foam covers and how
  // opaque it still is.
  let fresh = foamFrom(density, whitecap(crest) * amount);
  let aged = foamFrom(density, linger * amount) * mix(FOAM_AGED_OPACITY, 1.0, linger);
  var foam = max(fresh, aged);

  let gusting = smoothstep(0.45, 0.7, gustField(world, waves.wind));
  let streaky = smoothstep(STREAK_WIND_START, 1.0, waves.wind.z) * STREAK_COVERAGE * water.foam * gusting;
  if (streaky > 0.0) {
    let along = waves.wind.xy;
    let across = vec2f(-along.y, along.x);
    let streakUV = vec2f(dot(drifted, along) / STREAK_LENGTH, dot(drifted, across) / STREAK_WIDTH);
    let streak = foamFrom(foamDensity(streakUV, footprint, STREAK_WIDTH, STREAK_MIP_BIAS), streaky);
    foam = max(foam, streak * STREAK_OPACITY);
  }
  return foam * FOAM_OPACITY;
}

// Where a view-space point lands on screen, in 0..1 texture space.
fn screenUV(viewPosition: vec3f) -> vec2f {
  let clip = uniforms.projMatrix * vec4f(viewPosition, 1.0);
  let ndc = clip.xy / clip.w;
  return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}

// The scene seen through the water at `pixel`. The ray bends into the water by
// the wave normal N; the sample moves by how far that lands from where a flat
// surface would bend it, since the scene behind is already drawn where a flat
// surface puts it. A sample that lands on something in front of the water is
// not under it, so the pixel keeps its own.
fn refractedScene(input: VertexOutput, N: vec3f, depth: f32) -> vec3f {
  let size = vec2i(textureDimensions(refraction));
  let pixel = vec2i(input.Position.xy);
  let direction = normalize(input.viewPosition);
  let up = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  let reach = min(depth, REFRACTION_REACH);
  let bent = screenUV(input.viewPosition + refract(direction, N, AIR_TO_WATER) * reach);
  let level = screenUV(input.viewPosition + refract(direction, up, AIR_TO_WATER) * reach);
  let shifted = clamp(pixel + vec2i(round((bent - level) * vec2f(size))), vec2i(0), size - 1);

  let behind = textureLoad(refraction, shifted, 0);
  let own = textureLoad(refraction, pixel, 0);
  return select(own.rgb, behind.rgb, behind.a > -input.viewPosition.z);
}

// Replaces the scene behind the water with the refracted scene times the light
// that survives the trip through the water. Alpha is the coverage, so the
// water's edge fades to the scene.
@fragment
fn fs_absorb(input: VertexOutput) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);
  if (water.coverage <= 0.0) {
    discard;
  }

  let surfaceWave = waterNormal(input, water, footprint, ABSORB_OCTAVES);
  let N = surfaceWave.normal;
  let V = normalize(-input.viewPosition);
  let NoV = clamp(dot(N, V), 1e-4, 1.0);
  // Foam hides the water beneath it.
  let foam = waterFoam(input.rest + waves.origin.xy, footprint, surfaceWave.crest, input.linger, water);
  let passed = (1.0 - waterFresnel(NoV)) * waterTransmittance(water, NoV) * (1.0 - foam);
  return vec4f(refractedScene(input, N, water.depth) * passed, water.coverage);
}

@fragment
fn fs_light(input: VertexOutput) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);

  let viewPosition = input.viewPosition;
  let surfaceWave = waterNormal(input, water, footprint, NORMAL_OCTAVES);
  let normal = surfaceWave.normal;
  // The unsummed octaves' slopes spread the microfacets: α² grows by their
  // variance, so the highlight they would have made widens rather than aliases.
  let foam = waterFoam(input.rest + waves.origin.xy, footprint, surfaceWave.crest, input.linger, water);
  let waterAlpha = sqrt(min(pow(perceptualRoughnessToAlpha(params.roughness), 2.0) + surfaceWave.variance, 1.0));
  let alpha = mix(waterAlpha, perceptualRoughnessToAlpha(FOAM_ROUGHNESS), foam);
  let roughness = sqrt(alpha);
  let V = normalize(-viewPosition);
  let NoV = clamp(dot(normal, V), 1e-4, 1.0);
  let transmittance = waterTransmittance(water, NoV);

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // A dielectric whose diffuse lobe is the light the water scatters back: all
  // of it over deep water, none where the bed shows through. Foam is a rough,
  // bright diffuse layer over it.
  var surface: PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = mix(water.scatter * (vec3f(1.0) - transmittance), vec3f(FOAM_ALBEDO), foam);
  surface.f0 = vec3f(WATER_F0);
  surface.alpha = alpha;

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );

  let sunShadow = cloudShadowFactor * directionalShadowFactor;
  let direct = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
             + lit.punctualDiffuse + lit.punctualSpecular
             + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadowFactor;
  let indirect = evaluateIbl(surface, roughness);

  // Last, so every shadow and cube sample above runs in uniform control flow.
  if (water.coverage <= 0.0) {
    discard;
  }
  return vec4f((direct + indirect) * water.coverage, 1.0);
}
