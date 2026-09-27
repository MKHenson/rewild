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

// Air to water at normal incidence.
const WATER_F0: f32 = 0.02;

// Floor on N·V for the slant path through the water, so a grazing view does
// not read as infinitely deep.
const MIN_PATH_NOV: f32 = 0.1;

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
  // Chunk-edge distances past which a coarser grid can appear, and that grid's
  // spacing in metres; unused entries are 0. See waterGridBands.
  lodDistance : array<vec4f, 2>,
  lodSpacing : array<vec4f, 2>,
  // x: the finest grid's spacing, used nearer than the first distance.
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
  for (var i: u32 = 0u; i < MAX_WATER_TYPES; i++) {
    let e = params.extinction[i];
    out.scatter += params.scatter[i].rgb * weights[i];
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
  let w = waves.wave[i];
  let theta = w.z * dot(w.xy, p) - w.w * waves.time + waves.phase[i / 4][i % 4];
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

// The height at `rest` from the octaves the grid can hold, as
// WaterWaves.height sums it. Each octave drags the point the next samples.
fn geometryHeight(rest: vec2f, weights: vec4f, gain: vec2f, spacing: f32) -> f32 {
  let drag = dot(waves.drag, weights);
  var p = rest;
  var height = 0.0;
  for (var i: i32 = 0; i < WAVE_COUNT; i++) {
    let w = waves.wave[i];
    let resolved = smoothstep(RESOLVE_FROM * spacing, RESOLVE_TO * spacing, TWO_PI / w.z);
    if (resolved <= 0.0) {
      break;
    }
    let amplitude = dot(waves.amp[i], weights) * octaveVariation(gain, w.z) * resolved;
    let theta = wavePhase(i, p);
    let e = exp(sin(theta) - 1.0);
    height += amplitude * (e - WAVE_MEAN);
    p -= w.xy * (drag * amplitude * e * cos(theta));
  }
  return height;
}

struct WaveNormal {
  // View space.
  normal : vec3f,
  // Slope variance of the octaves too small on screen, or past the tier's
  // budget, to sum: widens the highlight instead of letting it sparkle.
  variance : f32,
}

// Metres of water surface one pixel covers at `rest`. Taken before any
// discard, where derivatives are still defined.
fn pixelFootprint(rest: vec2f) -> f32 {
  return max(length(dpdx(rest)), length(dpdy(rest)));
}

// The surface normal at `rest` over up to `octaves` octaves, including those
// too short for the grid to displace by, each fading out before it aliases.
// The drag's bending of the gradient is left out; it barely shows and would
// triple the cost.
fn waterNormal(rest: vec2f, water: WaterSample, footprint: f32, octaves: i32) -> WaveNormal {
  let gain = shoreCalm(water.depth) * waveVariation(rest + waves.origin.xy);
  let drag = dot(waves.drag, water.weights);
  var p = rest;
  var slope = vec2f(0.0);
  var variance = 0.0;
  var summed: i32 = 0;
  for (var i: i32 = 0; i < WAVE_COUNT; i++) {
    let w = waves.wave[i];
    let steepness = dot(waves.amp[i], water.weights) * octaveVariation(gain, w.z) * w.z;
    if (steepness < SILENT_STEEPNESS) {
      continue;
    }
    let pixels = TWO_PI / w.z / max(footprint, 1e-6) * waves.normalFade;
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
    let ec = exp(sin(theta) - 1.0) * cos(theta);
    slope += w.xy * (amplitude * ec * w.z);
    p -= w.xy * (drag * amplitude * ec);
  }
  var out: WaveNormal;
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

  var height = 0.0;
  if (calm > 0.0) {
    height = geometryHeight(rest, weights, calm * waveVariation(rest + waves.origin.xy), spacing);
  }

  let local = vec4f(input.position.x, surface.r + height, input.position.z, 1.0);
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  out.rest = rest;
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

@fragment
fn fs_absorb(input: VertexOutput) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);
  if (water.coverage <= 0.0) {
    discard;
  }

  let N = waterNormal(input.rest, water, footprint, ABSORB_OCTAVES).normal;
  let V = normalize(-input.viewPosition);
  let NoV = clamp(dot(N, V), 1e-4, 1.0);
  let passed = (1.0 - waterFresnel(NoV)) * waterTransmittance(water, NoV);
  return vec4f(mix(vec3f(1.0), passed, water.coverage), 1.0);
}

@fragment
fn fs_light(input: VertexOutput) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);

  let viewPosition = input.viewPosition;
  let surfaceWave = waterNormal(input.rest, water, footprint, NORMAL_OCTAVES);
  let normal = surfaceWave.normal;
  // The unsummed octaves' slopes spread the microfacets: α² grows by their
  // variance, so the highlight they would have made widens rather than aliases.
  let alpha = sqrt(min(pow(perceptualRoughnessToAlpha(params.roughness), 2.0) + surfaceWave.variance, 1.0));
  let roughness = sqrt(alpha);
  let V = normalize(-viewPosition);
  let NoV = clamp(dot(normal, V), 1e-4, 1.0);
  let transmittance = waterTransmittance(water, NoV);

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // A dielectric whose diffuse lobe is the light the water scatters back: all
  // of it over deep water, none where the bed shows through.
  var surface: PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = water.scatter * (vec3f(1.0) - transmittance);
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
