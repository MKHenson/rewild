// Water is drawn three times per chunk. `fs_depth` writes the nearest layer's
// depth; `fs_absorb` replaces the scene behind with the refracted scene times
// what survives the trip through the water, per channel; `fs_light` then adds
// what the surface reflects and what the water scatters back.
//
// Both faces draw. From above the front faces shade; from below, with the
// camera under the surface (under-water.wgsl), the back faces do: the view
// leaves through Snell's window or reflects off the surface, back down into
// the water.
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
#include "./shader-lib/water-waves.wgsl"
#include "./shader-lib/shore-waves.wgsl"
#include "./shader-lib/water-surface.wgsl"
#include "./shader-lib/under-water.wgsl"
#include "./shader-lib/water-fog.wgsl"

// Air to water at normal incidence.
const WATER_F0: f32 = 0.02;

// Floor on N·V for the slant path through the water, so a grazing view does
// not read as infinitely deep.
const MIN_PATH_NOV: f32 = 0.1;

// Air over water's index of refraction, and water over air's.
const AIR_TO_WATER: f32 = 0.75;
const WATER_TO_AIR: f32 = 1.333;
// Metres an in-water ray that meets nothing is taken to run.
const ENDLESS_WATER: f32 = 1e4;
// Share of the light foam passes down to a viewer below it.
const FOAM_BELOW: f32 = 0.3;
// Metres the refracted ray is followed down, at most, to find how far the
// waves bend it on screen. Shallow water bends it less, so the offset fades
// out at the shore.
const REFRACTION_REACH: f32 = 3.0;

const MAX_WATER_TYPES: u32 = 4u;
// Metres per texel of the finest cascade.
const FINEST_TEXEL: f32 = 0.0277;

// Depth in metres over which crest foam fades out toward the waterline.
const SHORE_FOAM_DEPTH: f32 = 1.5;
// Slopes are divided by the stretch of the surface, floored so a folding
// crest does not blow them up.
const MIN_STRETCH: f32 = 0.2;
// Mean square slope of a wind sea (Cox and Munk): a + b × wind speed. The
// share of it too fine for the mip a pixel samples widens the highlight
// instead: log2 of the pixel over the finest texel, over UNRESOLVED_OCTAVES.
const MSS_BASE: f32 = 0.003;
const MSS_PER_WIND: f32 = 0.00512;
const UNRESOLVED_OCTAVES: f32 = 10.0;

// Foam. Each cascade keeps its own crest foam where its surface folded, and
// lets it decay (OceanFFT). The pixel sums it over the cascades, filtered to
// its footprint: the coverage, times FOAM_COVERAGE and the palette's foam
// amount. The coverage is coarse, so it only says where foam may show. The
// lace says where inside that it does: the whole surface's stretch at the
// pixel, from LACE_FLAT (none) down to LACE_SQUEEZED (all). Foam shows first
// where the small waves squeeze the surface, and grows out from there as the
// coverage rises.
const FOAM_COVERAGE: f32 = 1.0;
const LACE_FLAT: f32 = 1.1;
const LACE_SQUEEZED: f32 = 0.5;
// Lace over which the coverage fades foam in.
const LACE_SOFTNESS: f32 = 0.3;
// Metres of water per pixel over which the lace gives way to the plain
// coverage: far out the small waves average away and the lace fails.
const FOAM_FAR_NEAR: f32 = 0.3;
const FOAM_FAR_FAR: f32 = 2.5;
// Opacity of all foam.
const FOAM_OPACITY: f32 = 0.9;
const FOAM_ALBEDO: f32 = 0.65;
// The foam texture over FOAM_TILE metres, and again over FOAM_TILE_LARGE
// turned by a 3-4-5 angle, so its repeat does not show; FOAM_TILE_LARGE share
// of it. Each tile turns a whole number of times over the 1024 m the origin
// snaps by, so the pattern does not jump when it moves.
const FOAM_TILE: f32 = 4.0;
const FOAM_TILE_LARGE: f32 = 12.8;
const FOAM_LARGE_SHARE: f32 = 0.4;
// How much the texture shapes where foam shows, against the lace and the
// breakup noise.
const FOAM_TEXTURE_SHAPE: f32 = 0.6;
// Foam's albedo in the texture's darkest bubbles, as a share of its brightest.
const FOAM_TEXTURE_SHADE: f32 = 0.5;
const FOAM_ROUGHNESS: f32 = 0.6;

// Crest glow: sunlight through the thin top of a wave, lit from behind (after
// the height term of the Atlas water talk). It fades in with the wave's height
// from SSS_LOW to SSS_HIGH metres, on faces turned away from the sun by
// SSS_TURN, and takes the water's scatter colour shifted toward green by
// SSS_TINT: the short trip through a crest keeps more green than the long
// trip up from the deep. SSS_STRENGTH is its brightness at a strength of 1.
const SSS_LOW: f32 = 0.5;
const SSS_HIGH: f32 = 3.0;
const SSS_TURN: f32 = 4.0;
const SSS_TINT: vec3f = vec3f(0.9, 1.4, 0.8);
const SSS_STRENGTH: f32 = 0.2;

// Troughs are darker than crests. A trough sees less sky, since much of what
// it reflects is the next wave, so the sky reflection and ambient fall to
// TROUGH_SKY. Less light reaches the water under it than under a thin crest,
// so its scatter falls to TROUGH_SCATTER. Both reach their floor at
// TROUGH_DEPTH metres below rest, scaled by the trough strength. Water at
// rest or above is unchanged, so a calm sea is too.
const TROUGH_SKY: f32 = 0.84;
const TROUGH_SCATTER: f32 = 0.84;
const TROUGH_DEPTH: f32 = 3.5;

// Breaker foam (shoreWave) breaks up into grain over the lace and
// SHORE_FOAM_CELL metre noise (SHORE_FOAM_CELLS to a repeat), with an edge
// SHORE_FOAM_SOFTNESS wide.
const SHORE_FOAM_CELL: f32 = 2.0;
const SHORE_FOAM_CELLS: i32 = 512;
const SHORE_FOAM_SOFTNESS: f32 = 0.12;
// Edge foam on lapping water: its strength at full wind, and the share of it
// left between laps.
const LAKE_FOAM_AMOUNT: f32 = 0.9;
const LAKE_FOAM_EBB: f32 = 0.4;
// Edge foam fades in over the water's first LAKE_FOAM_THIN metres at the
// waterline, then thins with depth to none at the palette's edge foam depth.
// Noise over LAKE_NOISE_CELL metres varies it along the shore down to
// LAKE_FOAM_PATCHY. It shows the foam texture between LAKE_FOAM_TEXTURE_LOW
// and LAKE_FOAM_TEXTURE_HIGH, so it reads as bubbles, never as a solid band.
const LAKE_FOAM_THIN: f32 = 0.04;
const LAKE_FOAM_PATCHY: f32 = 0.4;
const LAKE_FOAM_TEXTURE_LOW: f32 = 0.25;
const LAKE_FOAM_TEXTURE_HIGH: f32 = 0.85;
// Swash foam rides the sheet's edge while it runs up, over the sheet's last
// SWASH_FOAM_EDGE metres of thickness, and thins as it drains.
// The sine of the view ray's angle below level over which sheetThickness
// hands over from the water map's depth to the capture's.
const SHEET_GRAZING_LOW: f32 = 0.02;
const SHEET_GRAZING_HIGH: f32 = 0.1;
const SWASH_FOAM_EDGE: f32 = 0.06;
const SWASH_FOAM_AMOUNT: f32 = 0.9;

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
  // Metres the waves lift the surface above its rest height.
  @location(3) height : f32,
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
// Around the camera (ShoreField): seconds a shore wave takes to get here from
// deep water, its world xz gradient, and the waves' strength.
@group(1) @binding(6) var shoreMap : texture_2d<f32>;
// The swash field over the same grid (ShoreField): seconds a wave takes to
// get to the nearest water it reaches, and its strength there.
@group(1) @binding(7) var swashMap : texture_2d<f32>;
// The ocean (OceanFFT), one layer per cascade: displacement (Dx, Dy, Dz,
// foam) and slopes (dDy/dx, dDy/dz, dDx/dx, dDz/dz). The slopes are bound for
// the absorb and light draws.
@group(1) @binding(8) var oceanDisplacement : texture_2d_array<f32>;
@group(1) @binding(9) var oceanSlopes : texture_2d_array<f32>;
@group(1) @binding(10) var oceanSampler : sampler;
// Tiling foam (WaterTextures) with the repeating linear sampler. Bound for the
// shading draws only.
@group(1) @binding(11) var foamMap : texture_2d<f32>;
@group(1) @binding(12) var foamSampler : sampler;
@group(1) @binding(13) var<uniform> underWater : UnderWater;
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

// 0..1 breakup for the shore foam, two octaves of fine noise.
fn shoreFoamBreakup(rest: vec2f) -> f32 {
  let coarse = shoreNoise(rest, SHORE_FOAM_CELL, SHORE_FOAM_CELLS, 2u).x;
  let fine = shoreNoise(rest, SHORE_FOAM_CELL * 0.5, SHORE_FOAM_CELLS * 2, 3u).x;
  return saturate(0.5 + 0.3 * coarse + 0.3 * fine);
}

// Foam the wind drives into the shallows where water laps (see
// lakeSwashState): the foam texture's bubbles (`foamShade`), strongest in the
// shallowest water and gone by the palette's edge foam depth, read per pixel
// from the sheet's thickness, surging as each lap runs up and ebbing to
// LAKE_FOAM_EBB. It is not thresholded, so it has no hard edge.
fn lakeEdgeFoam(input: VertexOutput, water: WaterSample, foamShade: f32) -> f32 {
  let rest = input.rest;
  let width = dot(waves.lakeFoamWidth, water.weights);
  let strength = waves.lake.w * dot(waves.lakeTypes, water.weights);
  if (width <= 0.0 || strength <= 0.0) {
    return 0.0;
  }
  let thickness = sheetThickness(input, water.depth);
  let shallow = smoothstep(0.0, LAKE_FOAM_THIN, thickness) * (1.0 - smoothstep(0.0, width, thickness));
  let patches = mix(LAKE_FOAM_PATCHY, 1.0, smoothstep(-0.6, 0.6, shoreNoise(rest, LAKE_NOISE_CELL, LAKE_NOISE_CELLS, 6u).x));
  let bubbles = smoothstep(LAKE_FOAM_TEXTURE_LOW, LAKE_FOAM_TEXTURE_HIGH, foamShade);
  let lap = lakeSwashState(rest, 1.0);
  let draining = saturate((lap.cycle - SWASH_UPRUSH) / (1.0 - SWASH_UPRUSH));
  return shallow * patches * bubbles * strength * mix(1.0, LAKE_FOAM_EBB, draining) * LAKE_FOAM_AMOUNT;
}

// Metres of water over the ground straight below the pixel, from the gap to
// the scene behind in the refraction capture: the height texture is too coarse
// for a sheet a few centimetres thick. The gap is along the view ray, so near
// level it says nothing of the depth below, and on the level ray itself it
// reads zero; there the water map's `mapDepth` takes over.
fn sheetThickness(input: VertexOutput, mapDepth: f32) -> f32 {
  let behind = textureLoad(refraction, vec2i(input.Position.xy), 0).a;
  let near = max(-input.viewPosition.z, 1e-4);
  let direction = normalize(input.viewPosition);
  let up = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  let path = length(input.viewPosition) * max(behind / near - 1.0, 0.0);
  let steep = abs(dot(direction, up));
  return mix(mapDepth, path * steep, smoothstep(SHEET_GRAZING_LOW, SHEET_GRAZING_HIGH, steep));
}

// Foam on the swash sheet's leading edge: all of it while the sheet runs up,
// thinning as it drains. Lapping water has none; its foam is lakeEdgeFoam.
fn swashFoam(input: VertexOutput, weights: vec4f, depth: f32) -> f32 {
  let swash = sampleSwash(input.rest, weights);
  if (swash.runup <= 0.0) {
    return 0.0;
  }
  let draining = saturate((swash.cycle - SWASH_UPRUSH) / (1.0 - SWASH_UPRUSH));
  let edge = 1.0 - smoothstep(0.0, SWASH_FOAM_EDGE, sheetThickness(input, depth));
  let ocean = 1.0 - saturate(dot(waves.lakeTypes, weights));
  return edge * (1.0 - draining) * SWASH_FOAM_AMOUNT * ocean;
}

// The shore field painted for the debug view: blue where deep water reaches,
// red by how strongly shore waves show, green on the first train's crests.
fn shoreDebug(rest: vec2f, depth: f32) -> vec3f {
  let shore = sampleShore(rest);
  let reached = select(0.0, 1.0, length(shore.yz) > 1e-4);
  let fade = (1.0 - smoothstep(SHORE_FADE_SHALLOW, SHORE_FADE_DEEP, depth)) * shore.w;
  let wobble = shoreNoise(rest, SHORE_NOISE_CELL, SHORE_NOISE_CELLS, 0u).x * SHORE_WOBBLE;
  let crest = step(0.7, cos(shorePhase(0, shore.x, wobble))) * fade;
  return vec3f(fade, crest * 0.8, reached * 0.4);
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
  // Foam coverage before the palette.
  coverage : f32,
  // The whole surface's stretch (the Jacobian without its cross term): 1
  // flat, below 1 squeezed.
  stretch : f32,
  // Breaker foam coverage, and the 0..1 noise that breaks it up.
  shoreFoam : f32,
  shoreBreakup : f32,
  // 0..1: the foam texture, bright where foam is thick.
  foamTexture : f32,
  // Edge foam on lapping water (lakeEdgeFoam), shown as it is.
  lakeFoam : f32,
}

// The foam texture at `rest` (see FOAM_TILE), filtered to the pixel.
fn foamTexture(rest: vec2f, footprint: Footprint) -> f32 {
  let small = textureSampleGrad(foamMap, foamSampler, rest / FOAM_TILE, footprint.dx / FOAM_TILE, footprint.dy / FOAM_TILE).r;
  let turn = mat2x2f(0.8, 0.6, -0.6, 0.8) * (1.0 / FOAM_TILE_LARGE);
  let large = textureSampleGrad(foamMap, foamSampler, turn * rest, turn * footprint.dx, turn * footprint.dy).r;
  return mix(small, large, FOAM_LARGE_SHARE);
}

// The ocean at a pixel: the cascades' slopes and foam, filtered to the
// pixel's footprint, give the normal and the foam coverage.
fn oceanPixel(input: VertexOutput, water: WaterSample, footprint: Footprint) -> OceanPixel {
  let shore = shoreWave(input.rest, water.depth, footprint.size);
  let scales = cascadeScales(water.weights, water.depth, shore.variance);
  // Depth-limited waves are breaking waves, so the crest foam stays with them
  // until the waterline.
  let foamCalm = smoothstep(0.0, SHORE_FOAM_DEPTH, water.depth);
  let bias = exp2(waves.view.x);
  var d = shore.slopes;
  var foam = 0.0;
  for (var c: i32 = 0; c < CASCADES; c++) {
    let w = scales[c];
    let foamWeight = dot(waves.cascadeTypes[c], water.weights) * foamCalm;
    if (w <= 0.0 && foamWeight <= 0.0) {
      continue;
    }
    let size = waves.cascade[c].x;
    let uv = cascadeUV(c, input.rest);
    let ddx = footprint.dx / size;
    let ddy = footprint.dy / size;
    d += textureSampleGrad(oceanSlopes, oceanSampler, uv, c, ddx * bias, ddy * bias) * w;
    foam += textureSampleGrad(oceanDisplacement, oceanSampler, uv, c, ddx, ddy).w * foamWeight;
  }

  let shade = waves.view.y;
  let slopes = vec2f(d.x / max(d.z + 1.0, MIN_STRETCH), d.y / max(d.w + 1.0, MIN_STRETCH)) * shade;
  let unresolved = saturate(log2(max(footprint.size, FINEST_TEXEL) / FINEST_TEXEL) / UNRESOLVED_OCTAVES);

  var out: OceanPixel;
  out.normal = normalize(uniforms.normalMatrix * vec3f(-slopes.x, 1.0, -slopes.y));
  out.variance = (MSS_BASE + MSS_PER_WIND * waves.origin.z) * unresolved * scales[CASCADES - 1] * shade;
  out.coverage = foam;
  out.shoreFoam = max(shore.foam, swashFoam(input, water.weights, water.depth));
  out.shoreBreakup = shoreFoamBreakup(input.rest);
  out.foamTexture = foamTexture(input.rest, footprint);
  out.lakeFoam = lakeEdgeFoam(input, water, out.foamTexture);
  out.stretch = (d.z + 1.0) * (d.w + 1.0);
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
  let spacing = surfaceSpacing(rest, params.baseLevel + surface.r);
  let depth = max(surface.r - surface.g, 0.0);
  let surfaceMove = surfaceDisplacement(rest, depth, weights, spacing);
  let displacement = surfaceMove.displacement;

  let local = vec4f(
    input.position.x + displacement.x,
    surface.r + displacement.y + surfaceMove.lift,
    input.position.z + displacement.z,
    1.0
  );
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  out.rest = rest;
  out.height = displacement.y;
  return out;
}

// Whether a face is the side of the surface the pixel looks from: the top
// where its lens is in air, the underside where it is in water.
fn facesCamera(front: bool, viewPosition: vec3f) -> bool {
  let dir = (underWater.viewToWorld * vec4f(normalize(viewPosition), 0.0)).xyz;
  return front != lensInWater(dir);
}

// Writes the nearest layer's depth, so the shading draws skip every layer the
// waves fold behind it. Discards exactly where they do.
@fragment
fn fs_depth(input: VertexOutput, @builtin(front_facing) front: bool) {
  if (textureSample(surfaceMap, surfaceSampler, surfaceUV(input.uv)).b <= 0.0 || !facesCamera(front, input.viewPosition)) {
    discard;
  }
}

// Sunlight through a wave's crest. It needs the viewer to face the sun across
// the water (compared flat, so a high sun still counts) and a face that does
// not turn toward the sun. The higher the crest, the more.
fn crestGlow(height: f32, N: vec3f, V: vec3f, scatter: vec3f) -> vec3f {
  let up = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  let view = -V - up * dot(-V, up);
  var glow = vec3f(0.0);
  for (var i: u32 = 0u; i < lighting.numLights; i++) {
    let light = lighting.lights[i];
    if (light.lightType != 1.0) {
      continue;
    }
    // positionOrDirection is the way the light travels.
    let L = -light.positionOrDirection;
    let toSun = L - up * dot(L, up);
    let facing = dot(toSun, view) / max(length(toSun) * length(view), 1e-4);
    let behind = pow(saturate(facing), 3.0);
    let turned = pow(1.0 - saturate(dot(L, N)), SSS_TURN);
    glow += light.color * light.intensity * behind * turned;
  }
  let lift = smoothstep(SSS_LOW, SSS_HIGH, height);
  return glow * scatter * SSS_TINT * lift * SSS_STRENGTH * waves.grid.y;
}

// Foam 0..1 for the ocean at a pixel covering `footprint` metres: the lace
// where it passes 1 − coverage, so more coverage grows the foam out from the
// most squeezed spots. The coverage takes the palette's foam amount.
fn waterFoam(ocean: OceanPixel, footprint: f32, water: WaterSample) -> f32 {
  let coverage = saturate(ocean.coverage * FOAM_COVERAGE * water.foam);
  let squeeze = saturate((LACE_FLAT - ocean.stretch) / (LACE_FLAT - LACE_SQUEEZED));
  // The texture's bubbles and holes break the lace up, so foam grows in from
  // its thick parts.
  let lace = mix(squeeze, saturate(squeeze * 0.5 + ocean.foamTexture * 0.7), FOAM_TEXTURE_SHAPE);
  let shown = smoothstep(1.0 - coverage, 1.0 - coverage + LACE_SOFTNESS, lace);
  let far = smoothstep(FOAM_FAR_NEAR, FOAM_FAR_FAR, footprint);
  // Breaker foam lies on water the small waves may barely squeeze, so noise
  // and the texture join the lace to break it into grain.
  let grain = saturate(mix(ocean.shoreBreakup * 0.7 + squeeze * 0.6, ocean.shoreBreakup * 0.4 + squeeze * 0.3 + ocean.foamTexture * 0.6, FOAM_TEXTURE_SHAPE));
  let shore = smoothstep(1.0 - ocean.shoreFoam, 1.0 - ocean.shoreFoam + SHORE_FOAM_SOFTNESS, grain);
  return max(max(mix(shown, coverage, far), mix(shore, ocean.shoreFoam, far)), ocean.lakeFoam) * FOAM_OPACITY;
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

// The far plane's distance, from the projection.
fn farPlane() -> f32 {
  return uniforms.projMatrix[3][2] / (uniforms.projMatrix[2][2] + 1.0);
}

// A view ray meeting the surface from below, whose normal there is N (up,
// view space): where it leaves into the air through Snell's window, zero
// outside it, and the share the surface reflects back into the water.
struct FromBelow {
  exit : vec3f,
  mirror : vec3f,
  fresnel : f32,
}

fn fromBelow(viewPosition: vec3f, N: vec3f) -> FromBelow {
  let direction = normalize(viewPosition);
  var out: FromBelow;
  out.exit = refract(direction, -N, WATER_TO_AIR);
  out.mirror = reflect(direction, -N);
  let inside = dot(out.exit, out.exit) > 0.0;
  out.fresnel = select(1.0, waterFresnel(saturate(dot(out.exit, N))), inside);
  return out;
}

// The opaque scene above the water seen from below through Snell's window,
// as refractedScene: the sample moves by how far the waves bend the ray from
// where a flat surface would. w is 1 where the window shows the scene, 0
// where it shows the sky.
fn sceneAbove(input: VertexOutput, below: FromBelow) -> vec4f {
  let size = vec2i(textureDimensions(refraction));
  let pixel = vec2i(input.Position.xy);
  let direction = normalize(input.viewPosition);
  let up = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  let calm = refract(direction, -up, WATER_TO_AIR);
  var shifted = pixel;
  if (dot(calm, calm) > 0.0) {
    let bent = screenUV(input.viewPosition + below.exit * REFRACTION_REACH);
    let level = screenUV(input.viewPosition + calm * REFRACTION_REACH);
    shifted = clamp(pixel + vec2i(round((bent - level) * vec2f(size))), vec2i(0), size - 1);
  }
  let behind = textureLoad(refraction, shifted, 0);
  let scene = behind.a > -input.viewPosition.z && behind.a < farPlane() * 0.999;
  return select(vec4f(0.0), vec4f(behind.rgb, 1.0), scene);
}

// What the absorb draw reads at this pixel, bright enough to read through the
// exposure. View 1, three yes/no facts: red, the water map puts the ground
// more than 1 m below the surface; green, the refraction capture puts the
// opaque scene more than 0.5 m behind the surface; blue, the capture makes the
// water more than 1 m deep straight down. Deep water reads white. View 2, the
// palette weights as read, before they are normalised: red, green, blue for
// types 0, 1, 2; yellow where all four sum to under 0.5. View 3, the share of
// the light behind that passes through (waterTransmittance), as grey.
fn refractionDebug(input: VertexOutput, water: WaterSample, NoV: f32, view: f32) -> vec3f {
  if (view > 2.5) {
    return waterTransmittance(water, NoV) * 4.0;
  }
  if (view > 1.5) {
    let raw = textureSampleLevel(typeMap, surfaceSampler, surfaceUV(input.uv), 0.0);
    let total = raw.x + raw.y + raw.z + raw.w;
    return select(raw.xyz, vec3f(1.0, 1.0, 0.0), total < 0.5) * 4.0;
  }
  let behind = textureLoad(refraction, vec2i(input.Position.xy), 0).a;
  let near = -input.viewPosition.z;
  let mapDeep = select(0.0, 1.0, water.depth > 1.0);
  let captureBehind = select(0.0, 1.0, behind > near + 0.5);
  let captureDeep = select(0.0, 1.0, sheetThickness(input, water.depth) > 1.0);
  return vec3f(mapDeep, captureBehind, captureDeep) * 4.0;
}

// Replaces the scene behind the water with the refracted scene times the light
// that survives the trip through the water. Alpha is the coverage, so the
// water's edge fades to the scene.
@fragment
fn fs_absorb(input: VertexOutput, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);
  if (water.coverage <= 0.0 || !facesCamera(front, input.viewPosition)) {
    discard;
  }

  let ocean = oceanPixel(input, water, footprint);
  let N = ocean.normal;
  let V = normalize(-input.viewPosition);
  let NoV = clamp(dot(N, V), 1e-4, 1.0);
  // Foam hides the water beneath it.
  let foam = waterFoam(ocean, footprint.size, water);
  let passed = (1.0 - waterFresnel(NoV)) * waterTransmittance(water, NoV) * (1.0 - foam);
  if (waves.origin.w > 2.5) {
    return vec4f(refractionDebug(input, water, NoV, waves.origin.w - 2.0), 1.0);
  }
  if (waves.origin.w > 0.5) {
    return vec4f(0.0, 0.0, 0.0, water.coverage);
  }
  // From below, the scene above shows through Snell's window. The water
  // between the camera and the surface is the fog's (waterFog.wgsl).
  if (!front) {
    let below = fromBelow(input.viewPosition, N);
    let above = sceneAbove(input, below);
    return vec4f(above.rgb * (1.0 - below.fresnel) * (1.0 - foam), water.coverage);
  }
  return vec4f(refractedScene(input, N, water.depth) * passed, water.coverage);
}

@fragment
fn fs_light(input: VertexOutput, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let footprint = pixelFootprint(input.rest);
  let water = sampleWater(input.uv);

  let viewPosition = input.viewPosition;
  let ocean = oceanPixel(input, water, footprint);
  let normal = ocean.normal;
  let foam = waterFoam(ocean, footprint.size, water);
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
  // The scatter comes from under the surface, so it is lit along the
  // vertical, not by each ripple's tilt: shading it by the wave normal makes
  // painted plastic. The waves show through the reflection and the Fresnel.
  // Foam is a surface layer, so it takes the wave normal.
  let up = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  let trough = smoothstep(0.0, TROUGH_DEPTH, -input.height) * waves.grid.z;
  let scatter = water.scatter * (vec3f(1.0) - transmittance) * mix(1.0, TROUGH_SCATTER, trough);
  surface.normal = normalize(mix(up, normal, foam));
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = mix(scatter, vec3f(FOAM_ALBEDO * mix(FOAM_TEXTURE_SHADE, 1.0, ocean.foamTexture)), foam);
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
  // A trough sees less sky than a crest.
  let skySeen = mix(1.0, TROUGH_SKY, trough);
  let indirect = evaluateIbl(surface, roughness) * skySeen;
  // Only deep water glows: where the bed shows, the light passes through.
  let glow = crestGlow(input.height, normal, V, water.scatter) * sunShadow
           * (1.0 - waterFresnel(NoV)) * (1.0 - foam) * (vec3f(1.0) - transmittance);

  // Last, so every shadow and cube sample above runs in uniform control flow.
  if (water.coverage <= 0.0 || !facesCamera(front, input.viewPosition)) {
    discard;
  }
  if (waves.origin.w > 2.5) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  if (waves.origin.w > 1.5) {
    return vec4f(shoreDebug(input.rest, water.depth) * water.coverage, 1.0);
  }
  if (waves.origin.w > 0.5) {
    return vec4f(vec3f(saturate(ocean.coverage * FOAM_COVERAGE * water.foam)) * water.coverage, 1.0);
  }
  if (!front) {
    return vec4f(lightFromBelow(input, normal, foam) * water.coverage, 1.0);
  }
  return vec4f((direct + indirect + glow) * water.coverage, 1.0);
}

// The surface seen from below: the sky through Snell's window where no scene
// stands in front of it, the water below mirrored outside it, and the foam,
// a dim layer lit by the light through it.
fn lightFromBelow(input: VertexOutput, N: vec3f, foam: f32) -> vec3f {
  let below = fromBelow(input.viewPosition, N);
  let toWorld = mat3x3f(iblParams.viewToWorld[0].xyz, iblParams.viewToWorld[1].xyz, iblParams.viewToWorld[2].xyz);
  // The cube holds irradiance over π.
  let sky = textureSampleLevel(iblIrradianceMap, iblSampler, vec3f(0.0, 1.0, 0.0), 0.0).rgb * WATER_PI;
  var window = vec3f(0.0);
  if (below.fresnel < 1.0) {
    let skySeen = textureSampleLevel(iblSpecularMap, iblSampler, toWorld * below.exit, 0.0).rgb;
    window = skySeen * (1.0 - sceneAbove(input, below).w) * (1.0 - below.fresnel);
  }
  let bedBelow = cameraWaterDepth() + cameraBedBelow();
  let mirror = waterInScatter(normalize(toWorld * below.mirror), 0.0, bedBelow, ENDLESS_WATER, sky) * below.fresnel;
  let lit = (underWater.sun.rgb * underWater.sun.a + sky) / WATER_PI;
  let foamLight = FOAM_ALBEDO * FOAM_BELOW * lit;
  return mix((window + mirror) * iblParams.intensity, foamLight, foam);
}
