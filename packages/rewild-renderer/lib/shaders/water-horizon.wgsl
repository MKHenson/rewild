// Everything past the last terrain chunk, out to the horizon: a polar grid
// around the chunks' visibility centre. Its inner edge sits inside the terrain's
// view distance, so it also fills chunks still streaming in, and its last edge
// is at infinity, so the ground meets the horizon line at any camera height.
// Land stands at the far map's ground height, flattening to sea level by the
// outer radius. Open sea is shaded like deep chunk water with its far features
// only, land as a matte surface in the average colours of the materials the
// chunks' splat rules put there, broken up by a world-space tint, and blended
// across the coast.
//
// Every pixel writes the same depth (far-ground.wgsl) and rings draw inner
// first, so the first surface drawn on a pixel keeps it: nearer ground hides
// farther ground exactly, with no depth precision to run out of. The composite
// cannot read a distance from that depth, so the ring applies the scene fog
// itself.

const HAS_FOLIAGE_SHADING: bool = false;

#include "./shader-lib/total-lighting.wgsl"
#include "./shader-lib/brdf.wgsl"
#include "./shader-lib/pbr-lighting.wgsl"
#include "./shader-lib/ibl.wgsl"
#include "./shader-lib/cloud-shadow.wgsl"
#include "./shader-lib/pcf.wgsl"
#include "./shader-lib/directional-shadow.wgsl"
#include "./shader-lib/spot-light-shadow.wgsl"
#include "./shader-lib/far-ground.wgsl"
#include "./sky/atmosphere-uniforms.wgsl"

const WATER_F0: f32 = 0.02;
const LAND_F0: f32 = 0.04;
const LAND_ROUGHNESS: f32 = 1.0;
// Metres above sea level over which ground stops taking the sea's tint.
const SHORE_RISE_MIN: f32 = 1.0;
const SHORE_RISE_MAX: f32 = 8.0;

// Vertex radial parameter at or above this marks the edge at infinity.
const INFINITE_EDGE: f32 = 1.5;

// Metres across the land tint's broad and fine patches, how far each moves
// brightness either way, and the warmth that comes with brightness.
const TINT_BROAD: f32 = 900.0;
const TINT_FINE: f32 = 130.0;
const TINT_STRENGTH: f32 = 0.8;
const TINT_WARMTH: vec3f = vec3f(1.0, 0.85, 0.65);

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct HorizonParams {
  // Chunk visibility centre (world x, z).
  centre : vec2f,
  // Metres from the centre the ring starts.
  innerRadius : f32,
  chunkSize : f32,
  // Centre (world x, z) and span in metres of each far map level.
  nearCentre : vec2f,
  nearSpan : f32,
  seaLevel : f32,
  wideCentre : vec2f,
  wideSpan : f32,
  // Water roughness.
  roughness : f32,
  // The continent's coast value and blend half-width.
  coast : f32,
  blendHalfWidth : f32,
  // The chunk coordinates the chunk mask is centred on.
  maskOrigin : vec2f,
  // The ocean's scattered deep colour.
  scatter : vec3f,
  // Mean square slope of the waves (Cox and Munk). At this range none of
  // them resolve, so all of it widens the reflection, as it does on far chunk
  // water: a smooth mirror of the horizon sky reads far too bright.
  slopeVariance : f32,
  // Metres from the centre of the last finite ring.
  outerRadius : f32,
  // Metres from the centre the land starts flattening to sea level.
  fadeStart : f32,
  // 1 when the atmosphere composite runs, so the ring fogs itself.
  fogged : f32,
  // Albedo array layer of palette channels 0-3 and 4-7.
  paletteLayers : array<vec4f, 2>,
}

struct VertexInput {
  // (direction x, direction z, radial parameter): 0..1 across the finite rings,
  // INFINITE_EDGE and above on the edge at infinity.
  @location(0) position : vec3f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  // Homogeneous world position, so the last edge can sit at infinity.
  @location(0) world : vec4f,
  @location(1) view : vec4f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
// Far maps. Weights hold the palette weights, channels 0-3 in layer 0 and 4-7
// in layer 1; ground holds the height in metres and the continent value.
@group(1) @binding(0) var farSampler : sampler;
@group(1) @binding(1) var nearWeights : texture_2d_array<f32>;
@group(1) @binding(2) var<uniform> horizon : HorizonParams;
@group(1) @binding(3) var wideWeights : texture_2d_array<f32>;
// 1 where a terrain chunk drew this frame, per chunk, centred on maskOrigin.
@group(1) @binding(4) var chunkMask : texture_2d<f32>;
@group(1) @binding(5) var nearGround : texture_2d<f32>;
@group(1) @binding(6) var wideGround : texture_2d<f32>;
@group(1) @binding(7) var<uniform> object : FinalUniformStruct;
// The terrain materials' albedo; its smallest mip is each one's average colour.
@group(1) @binding(8) var albedoArray : texture_2d_array<f32>;
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

var<private> sunDotUp: f32;

// Rings are spaced geometrically, so each spans about the same height on screen.
fn ringRadius(s: f32) -> f32 {
  return horizon.innerRadius * pow(horizon.outerRadius / horizon.innerRadius, s);
}

// How much of the near level to use: all of it inside, handing over to the wide
// level before its edge.
fn nearWeight(nearUV: vec2f) -> f32 {
  let edge = min(min(nearUV.x, 1.0 - nearUV.x), min(nearUV.y, 1.0 - nearUV.y));
  return smoothstep(0.02, 0.08, edge);
}

fn nearUVAt(p: vec2f) -> vec2f {
  return (p - horizon.nearCentre) / horizon.nearSpan + 0.5;
}

fn wideUVAt(p: vec2f) -> vec2f {
  return (p - horizon.wideCentre) / horizon.wideSpan + 0.5;
}

// Ground height in metres, sea bed included, and the continent value at p.
fn sampleGround(p: vec2f) -> vec2f {
  let nearUV = nearUVAt(p);
  let near = textureSampleLevel(nearGround, farSampler, nearUV, 0.0).rg;
  let wide = textureSampleLevel(wideGround, farSampler, wideUVAt(p), 0.0).rg;
  return mix(wide, near, nearWeight(nearUV));
}

fn groundHeight(p: vec2f) -> f32 {
  return sampleGround(p).x;
}

// The ring's surface height at p: the ground, or the sea over water, flattened
// to sea level by the outer radius.
fn surfaceHeight(p: vec2f) -> f32 {
  let ground = max(groundHeight(p), horizon.seaLevel);
  let flatten = smoothstep(horizon.fadeStart, horizon.outerRadius, distance(p, horizon.centre));
  return mix(ground, horizon.seaLevel, flatten);
}

// World normal of the surface at p, differenced over a texel of the level in use.
fn surfaceNormal(p: vec2f) -> vec3f {
  let nearTexel = horizon.nearSpan / f32(textureDimensions(nearGround).x);
  let wideTexel = horizon.wideSpan / f32(textureDimensions(wideGround).x);
  let e = mix(wideTexel, nearTexel, nearWeight(nearUVAt(p)));
  let dx = surfaceHeight(p + vec2f(e, 0.0)) - surfaceHeight(p - vec2f(e, 0.0));
  let dz = surfaceHeight(p + vec2f(0.0, e)) - surfaceHeight(p - vec2f(0.0, e));
  return normalize(vec3f(-dx, 2.0 * e, -dz));
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  let dir = input.position.xy;
  let s = input.position.z;

  var world = vec4f(dir.x, 0.0, dir.y, 0.0);
  if (s < INFINITE_EDGE) {
    let p = horizon.centre + dir * ringRadius(s);
    world = vec4f(p.x, surfaceHeight(p), p.y, 1.0);
  }

  // Inside the far plane, so nothing is clipped; the fragment sets the depth.
  let view = uniforms.modelViewMatrix * world;
  var clip = uniforms.projMatrix * view;
  clip.z = clip.w * FAR_GROUND_DEPTH;

  var out: VertexOutput;
  out.Position = clip;
  out.world = world;
  out.view = view;
  return out;
}

// True where a terrain chunk drew this frame. A chunk in range but not yet
// meshed reads false, so the ring fills it instead of leaving sky.
fn chunkDrawn(p: vec2f) -> bool {
  let size = vec2i(textureDimensions(chunkMask));
  // floor(x + 0.5) rounds as Math.round does on the CPU.
  let cell = vec2i(floor(p / horizon.chunkSize + 0.5) - horizon.maskOrigin) + size / 2;
  if (any(cell < vec2i(0)) || any(cell >= size)) {
    return false;
  }
  return textureLoad(chunkMask, cell, 0).r > 0.5;
}

fn materialAverage(layer: f32) -> vec3f {
  let smallest = f32(textureNumLevels(albedoArray) - 1u);
  return textureSampleLevel(albedoArray, farSampler, vec2f(0.5), u32(layer), smallest).rgb;
}

// The palette weights at p, blended into their materials' average colours.
fn landColour(p: vec2f) -> vec3f {
  let nearUV = nearUVAt(p);
  let wideUV = wideUVAt(p);
  let w = nearWeight(nearUV);
  let lo = mix(
    textureSampleLevel(wideWeights, farSampler, wideUV, 0u, 0.0),
    textureSampleLevel(nearWeights, farSampler, nearUV, 0u, 0.0),
    w
  );
  let hi = mix(
    textureSampleLevel(wideWeights, farSampler, wideUV, 1u, 0.0),
    textureSampleLevel(nearWeights, farSampler, nearUV, 1u, 0.0),
    w
  );
  let layersLo = horizon.paletteLayers[0];
  let layersHi = horizon.paletteLayers[1];
  let colour =
      lo.x * materialAverage(layersLo.x) + lo.y * materialAverage(layersLo.y)
    + lo.z * materialAverage(layersLo.z) + lo.w * materialAverage(layersLo.w)
    + hi.x * materialAverage(layersHi.x) + hi.y * materialAverage(layersHi.y)
    + hi.z * materialAverage(layersHi.z) + hi.w * materialAverage(layersHi.w);
  // Quantised weights no longer sum to exactly 1.
  return colour / max(dot(lo, vec4f(1.0)) + dot(hi, vec4f(1.0)), 1e-3);
}

fn tintHash(c: vec2i) -> f32 {
  var h = (u32(c.x) * 1597334677u) ^ (u32(c.y) * 3812015801u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = h ^ (h >> 13u);
  return f32(h) / 4294967295.0;
}

fn tintNoise(q: vec2f) -> f32 {
  let cell = vec2i(floor(q));
  let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(tintHash(cell), tintHash(cell + vec2i(1, 0)), u.x),
    mix(tintHash(cell + vec2i(0, 1)), tintHash(cell + vec2i(1, 1)), u.x),
    u.y
  );
}

// Patchy brightness over the far ground, which the averaged materials alone
// leave flat. Brighter patches run warmer, as sunlit dry ground does.
fn landTint(p: vec2f) -> vec3f {
  let n = tintNoise(p / TINT_BROAD) * 0.65 + tintNoise(p / TINT_FINE) * 0.35;
  return vec3f(1.0) + (n - 0.5) * 2.0 * TINT_STRENGTH * TINT_WARMTH;
}

// 1 on open sea, 0 inland: the continent's own land weight, inverted.
fn oceanWeight(c: f32) -> f32 {
  let half = horizon.blendHalfWidth;
  return 1.0 - smoothstep(horizon.coast - half, horizon.coast + half, c);
}

struct FragmentOutput {
  @location(0) color : vec4f,
  @builtin(frag_depth) depth : f32,
}

@fragment
fn fs(input: VertexOutput) -> FragmentOutput {
  let ground = input.world.xyz / max(input.world.w, 1e-6);
  let p = ground.xz;
  let groundAt = sampleGround(p);
  // The continent's coast is smooth and the ground is not, so ground standing
  // clear of the water is land whatever the continent says.
  let ashore = smoothstep(SHORE_RISE_MIN, SHORE_RISE_MAX, groundAt.x - horizon.seaLevel);
  let ocean = oceanWeight(groundAt.y) * (1.0 - ashore);
  let waterAlpha = sqrt(min(pow(perceptualRoughnessToAlpha(horizon.roughness), 2.0) + horizon.slopeVariance, 1.0));
  let alpha = mix(perceptualRoughnessToAlpha(LAND_ROUGHNESS), waterAlpha, ocean);
  let roughness = sqrt(alpha);

  let viewPosition = input.view.xyz / max(input.view.w, 1e-6);
  let worldNormal = normalize(mix(surfaceNormal(p), vec3f(0.0, 1.0, 0.0), ocean));
  let normal = normalize(uniforms.normalMatrix * worldNormal);

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // Past the shadow distance a lookup still lands in the last cascade at a
  // grazing angle, which reads as flickering blotches on far slopes.
  if (-viewPosition.z > directionalShadowParams.cascadeSplits.z) {
    directionalShadowFactor = 1.0;
  }

  // Deep water shows all its scattered colour, since the bed is out of sight.
  var surface: PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = mix(landColour(p) * landTint(p), horizon.scatter.rgb, ocean);
  surface.f0 = vec3f(mix(LAND_F0, WATER_F0, ocean));
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

  // The scene fog, as the atmosphere composite applies it, at the true distance.
  let toGround = ground - object.cameraPosition;
  let groundDistance = length(toGround);
  let viewDir = toGround / max(groundDistance, 1e-6);
  let toSun = normalize(object.sunPosition);
  sunDotUp = toSun.y;
  let fog = (1.0 - sceneFogTransmittance(object.cameraPosition, viewDir, groundDistance)) * horizon.fogged;
  let color = mix(direct + indirect, getFogScatterColor(viewDir, toSun), fog);

  // Last, so every sample above runs in uniform control flow.
  if (chunkDrawn(p)) {
    discard;
  }

  var out: FragmentOutput;
  out.color = vec4f(color, 1.0);
  out.depth = FAR_GROUND_DEPTH;
  return out;
}
