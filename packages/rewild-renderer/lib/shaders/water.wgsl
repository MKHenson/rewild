// Water is drawn three times per chunk. `fs_depth` writes the nearest layer's
// depth; `fs_absorb` replaces the scene behind with the refracted scene times
// what survives the trip through the water, per channel; `fs_light` then adds
// what the surface reflects and what the water scatters back.
//
// The surface is the FFT ocean (OceanFFT): each cascade's displacement moves
// the grid, sampled at a mip the grid can hold, and each cascade's slopes
// shade the pixel. A palette type weights the cascades, so a lake keeps only
// the short ones.

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

const MAX_WATER_TYPES: u32 = 4u;
const CASCADES: i32 = 4;
// Texels per side of a cascade's tile.
const FFT_N: f32 = 256.0;
// Metres per texel of the finest cascade.
const FINEST_TEXEL: f32 = 0.0277;

// Metres before each LOD distance over which the spacing ramps to the coarser
// grid's, so the mip a vertex samples never jumps.
const LOD_RAMP: f32 = 60.0;
// Mips a vertex samples above the one matching its grid spacing, so no wave
// shorter than the grid can hold displaces it.
const VERTEX_MIP_BIAS: f32 = 0.7;
// Depth in metres over which waves die down toward the waterline.
const SHORE_CALM_DEPTH: f32 = 1.5;
// Slopes are divided by the stretch of the surface, floored so a folding
// crest does not blow them up.
const MIN_STRETCH: f32 = 0.2;
// Mean square slope of a wind sea (Cox and Munk): a + b × wind speed. The
// share of it too fine for the mip a pixel samples widens the highlight
// instead: log2 of the pixel over the finest texel, over UNRESOLVED_OCTAVES.
const MSS_BASE: f32 = 0.003;
const MSS_PER_WIND: f32 = 0.00512;
const UNRESOLVED_OCTAVES: f32 = 10.0;

// Cat's paws: the foliage gust field scales the short cascades between a lull
// and a gust, fully so from this wind strength up. The shortest takes it all,
// the next half; neither moves the grid near enough to matter.
const GUST_LULL: f32 = 0.5;
const GUST_PEAK: f32 = 1.8;
const GUST_FULL_STRENGTH: f32 = 0.5;

// Large-scale variation, matching WaterWaves.variation: a swell and a chop
// field, blended into each cascade by its length.
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

// Foam. The ocean keeps foam where the surface compressed and lets it decay
// (OceanFFT); the vertex stage sums it over the cascades. The pixel adds fresh
// foam where its own slopes squeeze the surface now: the stretch below
// FOAM_FRESH_BIAS, at FOAM_FRESH_GAIN. The sum is the coverage, times
// FOAM_COVERAGE and the palette's foam amount.
const FOAM_COVERAGE: f32 = 1.0;
const FOAM_FRESH_BIAS: f32 = 0.43;
const FOAM_FRESH_GAIN: f32 = 2.0;
// Metres per repeat of the foam texture: two tilings, one turned, to hide the
// repeat. Each divides FOAM_DRIFT_PERIOD, so the drift wraps without a jump.
const FOAM_TILE_A: f32 = 8.0;
const FOAM_TILE_B: f32 = 12.8;
// cos and sin of the turn of the second tiling.
const FOAM_TURN: vec2f = vec2f(0.7986355, 0.6018150);
// Texture density over which coverage fades foam in.
const FOAM_SOFTNESS: f32 = 0.25;
// Opacity of the thinnest foam the texture shows; its densest clumps are
// opaque, so bubbles and thin spots show the water through.
const FOAM_THIN: f32 = 0.15;
// Opacity of all foam.
const FOAM_OPACITY: f32 = 0.9;
// Metres of water per pixel over which the texture gives way to the plain
// coverage: far out the texture averages to grey and its threshold fails.
const FOAM_FAR_NEAR: f32 = 0.15;
const FOAM_FAR_FAR: f32 = 1.2;
const FOAM_ALBEDO: f32 = 0.65;
const FOAM_ROUGHNESS: f32 = 0.6;

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct WaterParams {
  // Texels per side of the water map.
  texels : f32,
  roughness : f32,
  // The chunk's centre in world xz.
  originX : f32,
  originZ : f32,
  // Per palette entry: linear colour scattered back out of deep water; a the
  // crest foam amount.
  scatter : array<vec4f, 4>,
  // Per palette entry: rgb absorption per metre, a = turbidity per metre.
  extinction : array<vec4f, 4>,
  // World height the level and terrain heights are relative to.
  baseLevel : f32,
}

struct Waves {
  // x: mip bias on the slopes, from the quality tier. y: 1 to shade by the
  // waves, 0 to leave the normal flat. zw: the viewer's xz from the origin,
  // where chunk LODs were chosen.
  view : vec4f,
  // xy: the world xz positions are measured from, near the camera. z: the
  // wind speed in m/s the ocean spectrum was built for. w: 1 paints the raw
  // foam coverage in grey instead of the water.
  origin : vec4f,
  // The variation noise's drift in lattice cells: [0] the swell field's
  // octaves A xy and B zw, [1] the chop field's.
  variation : array<vec4f, 2>,
  // The foliage wind: direction the air moves xz, strength, clock in
  // full-wind seconds. Its gust field ruffles the short cascades.
  wind : vec4f,
  // Chunk-edge distances past which a coarser grid can appear, and that grid's
  // spacing in metres; unused entries are 0. See waterGridBands.
  lodDistance : array<vec4f, 2>,
  lodSpacing : array<vec4f, 2>,
  // x: the finest grid's spacing, used nearer than the first distance. yz:
  // metres the foam has drifted downwind, wrapped.
  grid : vec4f,
  // Per cascade: x tile size in metres, zw where the origin falls in the tile.
  cascade : array<vec4f, 4>,
  // Per cascade: each palette type's weight on it.
  cascadeTypes : array<vec4f, 4>,
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
  // xz the vertex rests at before the waves move it, from the origin. The
  // ocean's textures are sampled here: where the water came from.
  @location(2) rest : vec2f,
  // The ocean's lasting foam over the cascades.
  @location(3) foam : f32,
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
// The ocean (OceanFFT), one layer per cascade: displacement (Dx, Dy, Dz,
// foam) and slopes (dDy/dx, dDy/dz, dDx/dx, dDz/dz). The slopes are bound for
// the absorb and light draws.
@group(1) @binding(8) var oceanDisplacement : texture_2d_array<f32>;
@group(1) @binding(9) var oceanSlopes : texture_2d_array<f32>;
@group(1) @binding(10) var oceanSampler : sampler;
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

// How much the gust field scales the ripples at world xz.
fn gustScale(world: vec2f) -> f32 {
  let gust = smoothstep(0.35, 0.65, gustField(world, waves.wind));
  return mix(1.0, mix(GUST_LULL, GUST_PEAK, gust), min(waves.wind.z / GUST_FULL_STRENGTH, 1.0));
}

// How strongly cascade `c` moves this water: the palette's weights, the
// variation blended from swell to chop by the cascade's length, the calm at
// the shore, and the gusts on the two shortest.
fn cascadeScale(c: i32, weights: vec4f, variation: vec2f, calm: f32, gust: f32) -> f32 {
  let band = f32(c) / f32(CASCADES - 1);
  let gusted = select(select(1.0, mix(1.0, gust, 0.5), c == CASCADES - 2), gust, c == CASCADES - 1);
  return dot(waves.cascadeTypes[c], weights) * mix(variation.x, variation.y, band) * calm * gusted;
}

// Where `rest` falls in cascade `c`'s tile.
fn cascadeUV(c: i32, rest: vec2f) -> vec2f {
  let cascade = waves.cascade[c];
  return rest / cascade.x + cascade.zw;
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

// Waves die down toward the waterline rather than lifting water over the sand.
fn shoreCalm(depth: f32) -> f32 {
  return smoothstep(0.0, SHORE_CALM_DEPTH, depth);
}

// How a pixel's rest position changes across the screen. Taken before any
// discard, where derivatives are still defined.
struct Footprint {
  dx : vec2f,
  dy : vec2f,
  // Metres of water surface the pixel covers.
  size : f32,
}

fn pixelFootprint(rest: vec2f) -> Footprint {
  var out: Footprint;
  out.dx = dpdx(rest);
  out.dy = dpdy(rest);
  out.size = max(length(out.dx), length(out.dy));
  return out;
}

struct OceanPixel {
  // View space.
  normal : vec3f,
  // Slope variance too fine for the mip the pixel sampled: widens the
  // highlight instead of letting it sparkle.
  variance : f32,
  // Foam coverage before the palette and the texture.
  coverage : f32,
}

// The ocean at a pixel: the cascades' slopes, filtered to the pixel's
// footprint, give the normal; the lasting foam from the vertex stage and the
// fresh foam where the slopes squeeze the surface give the coverage.
fn oceanPixel(input: VertexOutput, water: WaterSample, footprint: Footprint) -> OceanPixel {
  let world = input.rest + waves.origin.xy;
  let variation = waveVariation(world);
  let calm = shoreCalm(water.depth);
  let gust = gustScale(world);
  let bias = exp2(waves.view.x);
  var d = vec4f(0.0);
  for (var c: i32 = 0; c < CASCADES; c++) {
    let w = cascadeScale(c, water.weights, variation, calm, gust);
    if (w <= 0.0) {
      continue;
    }
    let size = waves.cascade[c].x;
    d += textureSampleGrad(
      oceanSlopes, oceanSampler, cascadeUV(c, input.rest), c,
      footprint.dx / size * bias, footprint.dy / size * bias
    ) * w;
  }

  let shade = waves.view.y;
  let slopes = vec2f(d.x / max(d.z + 1.0, MIN_STRETCH), d.y / max(d.w + 1.0, MIN_STRETCH)) * shade;
  let stretch = (d.z + 1.0) * (d.w + 1.0);
  let unresolved = saturate(log2(max(footprint.size, FINEST_TEXEL) / FINEST_TEXEL) / UNRESOLVED_OCTAVES);

  var out: OceanPixel;
  out.normal = normalize(uniforms.normalMatrix * vec3f(-slopes.x, 1.0, -slopes.y));
  out.variance = (MSS_BASE + MSS_PER_WIND * waves.origin.z) * unresolved * calm * shade;
  out.coverage = input.foam + saturate((FOAM_FRESH_BIAS - stretch) * FOAM_FRESH_GAIN);
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

// Each cascade's share of the lasting foam.
fn cascadeFoam(c: i32) -> f32 {
  var shares = array<f32, 4>(0.35, 0.45, 0.5, 0.25);
  return shares[c];
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
  let fromEye = vec3f(rest.x - waves.view.z, params.baseLevel + surface.r, rest.y - waves.view.w);
  let spacing = gridSpacingAt(length(fromEye));
  let calm = shoreCalm(max(surface.r - surface.g, 0.0));
  let variation = waveVariation(rest + waves.origin.xy);

  var displacement = vec3f(0.0);
  var foam = 0.0;
  if (calm > 0.0) {
    for (var c: i32 = 0; c < CASCADES; c++) {
      let w = cascadeScale(c, weights, variation, calm, 1.0);
      if (w <= 0.0) {
        continue;
      }
      // The mip whose texels match the grid, so no wave shorter than the grid
      // can hold moves it.
      let texel = waves.cascade[c].x / FFT_N;
      let level = max(log2(spacing / texel) + VERTEX_MIP_BIAS, 0.0);
      let uv = cascadeUV(c, rest);
      let s = textureSampleLevel(oceanDisplacement, oceanSampler, uv, c, level);
      displacement += s.xyz * w;
      // Foam is smooth enough per vertex, read no finer than this mip.
      let lasting = select(s.w, textureSampleLevel(oceanDisplacement, oceanSampler, uv, c, 1.5).w, level < 1.5);
      foam += lasting * cascadeFoam(c) * w;
    }
  }

  let local = vec4f(
    input.position.x + displacement.x,
    surface.r + displacement.y,
    input.position.z + displacement.z,
    1.0
  );
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  out.rest = rest;
  out.foam = foam;
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
fn foamDensity(uv: vec2f, footprint: f32, tile: f32) -> f32 {
  let size = f32(textureDimensions(foamTexture).x);
  let lod = log2(max(footprint * size / tile, 1.0));
  let texel = textureSampleLevel(foamTexture, foamSampler, uv, lod);
  return texel.r * texel.a;
}

// Foam 0..1 where density passes 1 − coverage, so more coverage grows the
// patches out from the densest clumps.
fn foamFrom(density: f32, coverage: f32) -> f32 {
  let shown = smoothstep(1.0 - coverage, 1.0 - coverage + FOAM_SOFTNESS, density);
  return shown * mix(FOAM_THIN, 1.0, density);
}

// Foam at `world` xz for the ocean's coverage there, drawn through the foam
// texture, scaled by the palette's foam amount and drifting downwind.
fn waterFoam(world: vec2f, footprint: f32, oceanCoverage: f32, water: WaterSample) -> f32 {
  if (water.foam <= 0.0) {
    return 0.0;
  }
  let coverage = saturate(oceanCoverage * FOAM_COVERAGE * water.foam);
  let drifted = world - waves.grid.yz;
  let turned = vec2f(
    drifted.x * FOAM_TURN.x - drifted.y * FOAM_TURN.y,
    drifted.x * FOAM_TURN.y + drifted.y * FOAM_TURN.x
  );
  let density = 0.6 * foamDensity(drifted / FOAM_TILE_A, footprint, FOAM_TILE_A)
              + 0.4 * foamDensity(turned / FOAM_TILE_B, footprint, FOAM_TILE_B);
  let far = smoothstep(FOAM_FAR_NEAR, FOAM_FAR_FAR, footprint);
  let foam = mix(foamFrom(density, coverage), coverage * 0.85, far);
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

  let ocean = oceanPixel(input, water, footprint);
  let N = ocean.normal;
  let V = normalize(-input.viewPosition);
  let NoV = clamp(dot(N, V), 1e-4, 1.0);
  // Foam hides the water beneath it.
  let foam = waterFoam(input.rest + waves.origin.xy, footprint.size, ocean.coverage, water);
  let passed = (1.0 - waterFresnel(NoV)) * waterTransmittance(water, NoV) * (1.0 - foam);
  if (waves.origin.w > 0.5) {
    return vec4f(0.0, 0.0, 0.0, water.coverage);
  }
  return vec4f(refractedScene(input, N, water.depth) * passed, water.coverage);
}

@fragment
fn fs_light(input: VertexOutput) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);

  let viewPosition = input.viewPosition;
  let ocean = oceanPixel(input, water, footprint);
  let normal = ocean.normal;
  let foam = waterFoam(input.rest + waves.origin.xy, footprint.size, ocean.coverage, water);
  // The unresolved slopes spread the microfacets: α² grows by their variance,
  // so the highlight they would have made widens rather than aliases.
  let waterAlpha = sqrt(min(pow(perceptualRoughnessToAlpha(params.roughness), 2.0) + ocean.variance, 1.0));
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
  if (waves.origin.w > 0.5) {
    return vec4f(vec3f(saturate(ocean.coverage * FOAM_COVERAGE * water.foam)) * water.coverage, 1.0);
  }
  return vec4f((direct + indirect) * water.coverage, 1.0);
}
