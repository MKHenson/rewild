// Everything past the last terrain chunk, out to the horizon. One ring around
// the chunks' visibility centre: its inner edge sits at the terrain's view
// distance and its outer edge at infinity, so the ground meets the horizon line
// at any camera height. Flat at sea level: open sea is shaded like deep chunk
// water with its far features only, land as a matte surface in its biome's far
// colour, blended across the coast.

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

const WATER_F0: f32 = 0.02;
const LAND_F0: f32 = 0.04;
const LAND_ROUGHNESS: f32 = 1.0;

// Clip depth of the horizon edge: just inside the far plane, so the ring is not
// clipped. The depth it writes is FAR_GROUND_DEPTH throughout.
const HORIZON_DEPTH: f32 = 0.99999;

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct HorizonParams {
  // Chunk visibility centre (world x, z).
  centre : vec2f,
  // The terrain's view distance: the ring's inner radius.
  maxViewDst : f32,
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
  _pad0 : f32,
  _pad1 : f32,
  // The ocean's scattered deep colour.
  scatter : vec4f,
}

struct VertexInput {
  // (direction x, direction z, 1 on the outer edge).
  @location(0) position : vec3f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  // World (x, z, w): homogeneous, so the outer edge can sit at infinity.
  @location(0) world : vec3f,
  @location(1) view : vec4f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
// Far maps: rgb is the land's far colour, a the continent value.
@group(1) @binding(0) var farSampler : sampler;
@group(1) @binding(1) var nearMap : texture_2d<f32>;
@group(1) @binding(2) var<uniform> horizon : HorizonParams;
@group(1) @binding(3) var wideMap : texture_2d<f32>;
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

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  let dir = input.position.xy;
  let outer = input.position.z > 0.5;

  var world = vec4f(
    horizon.centre.x + dir.x * horizon.maxViewDst,
    horizon.seaLevel,
    horizon.centre.y + dir.y * horizon.maxViewDst,
    1.0
  );
  if (outer) {
    world = vec4f(dir.x, 0.0, dir.y, 0.0);
  }

  let view = uniforms.modelViewMatrix * world;
  var clip = uniforms.projMatrix * view;
  if (outer) {
    clip.z = clip.w * HORIZON_DEPTH;
  }

  var out: VertexOutput;
  out.Position = clip;
  out.world = vec3f(world.x, world.z, world.w);
  out.view = view;
  return out;
}

// True where a terrain chunk is drawn: its square lies within the view
// distance of the visibility centre, the same test TerrainRenderer uses.
fn insideChunks(p: vec2f) -> bool {
  let size = horizon.chunkSize;
  let chunkCentre = round(p / size) * size;
  let nearest = clamp(horizon.centre, chunkCentre - size * 0.5, chunkCentre + size * 0.5);
  return distance(horizon.centre, nearest) <= horizon.maxViewDst;
}

// Near level where it reaches, handing over to the wide level before its edge.
fn sampleFarMap(p: vec2f) -> vec4f {
  let nearUV = (p - horizon.nearCentre) / horizon.nearSpan + 0.5;
  let wideUV = (p - horizon.wideCentre) / horizon.wideSpan + 0.5;
  let near = textureSample(nearMap, farSampler, nearUV);
  let wide = textureSample(wideMap, farSampler, wideUV);
  let edge = min(min(nearUV.x, 1.0 - nearUV.x), min(nearUV.y, 1.0 - nearUV.y));
  return mix(wide, near, smoothstep(0.02, 0.08, edge));
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
  let p = input.world.xy / max(input.world.z, 1e-6);
  let far = sampleFarMap(p);
  let ocean = oceanWeight(far.a);
  let roughness = mix(LAND_ROUGHNESS, horizon.roughness, ocean);

  let viewPosition = input.view.xyz / max(input.view.w, 1e-6);
  let normal = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));

  #include "./shader-lib/cloud-shadow.frag.wgsl"
  #include "./shader-lib/directional-shadow.frag.wgsl"
  #include "./shader-lib/spot-light-shadow.frag.wgsl"

  // Deep water shows all its scattered colour, since the bed is out of sight.
  var surface: PbrSurface;
  surface.normal = normal;
  surface.specularNormal = normal;
  surface.geometricNormal = normal;
  surface.viewPosition = viewPosition;
  surface.diffuseColor = mix(far.rgb, horizon.scatter.rgb, ocean);
  surface.f0 = vec3f(mix(LAND_F0, WATER_F0, ocean));
  surface.alpha = perceptualRoughnessToAlpha(roughness);

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

  // Last, so every sample above runs in uniform control flow.
  if (insideChunks(p)) {
    discard;
  }

  // A marker for the atmosphere composite, which fogs this pixel by its true
  // distance to the sea-level plane.
  var out: FragmentOutput;
  out.color = vec4f(direct + indirect, 1.0);
  out.depth = FAR_GROUND_DEPTH;
  return out;
}
