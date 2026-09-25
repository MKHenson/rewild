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

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct WaterParams {
  // Texels per side of the water map.
  texels : f32,
  roughness : f32,
  _pad0 : f32,
  _pad1 : f32,
  // Per palette entry: linear colour scattered back out of deep water.
  scatter : array<vec4f, 4>,
  // Per palette entry: rgb absorption per metre, a = turbidity per metre.
  extinction : array<vec4f, 4>,
}

struct VertexInput {
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) viewPosition : vec3f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var surfaceSampler : sampler;
// (level, terrain height, coverage, _) relative to the base level, which the
// mesh transform carries.
@group(1) @binding(1) var surfaceMap : texture_2d<f32>;
@group(1) @binding(2) var<uniform> params : WaterParams;
// Weights over the water palette.
@group(1) @binding(3) var typeMap : texture_2d<f32>;
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
  scatter : vec3f,
  extinction : vec3f,
}

fn sampleWater(uv: vec2f) -> WaterSample {
  let suv = surfaceUV(uv);
  let surface = textureSample(surfaceMap, surfaceSampler, suv);
  var weights = textureSample(typeMap, surfaceSampler, suv);
  let total = weights.x + weights.y + weights.z + weights.w;
  weights = select(vec4f(1.0, 0.0, 0.0, 0.0), weights / total, total > 1e-4);

  var out: WaterSample;
  out.coverage = surface.b;
  out.depth = max(surface.r - surface.g, 0.0);
  out.scatter = vec3f(0.0);
  out.extinction = vec3f(0.0);
  for (var i: u32 = 0u; i < MAX_WATER_TYPES; i++) {
    let e = params.extinction[i];
    out.scatter += params.scatter[i].rgb * weights[i];
    out.extinction += (e.rgb + vec3f(e.a)) * weights[i];
  }
  return out;
}

fn waterNormal() -> vec3f {
  return normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
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
  let surface = textureSampleLevel(surfaceMap, surfaceSampler, surfaceUV(input.uv), 0.0);
  let local = vec4f(input.position.x, surface.r, input.position.z, 1.0);
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  return out;
}

@fragment
fn fs_absorb(input: VertexOutput) -> @location(0) vec4f {
  let water = sampleWater(input.uv);
  if (water.coverage <= 0.0) {
    discard;
  }

  let N = waterNormal();
  let V = normalize(-input.viewPosition);
  let NoV = clamp(dot(N, V), 1e-4, 1.0);
  let passed = (1.0 - waterFresnel(NoV)) * waterTransmittance(water, NoV);
  return vec4f(mix(vec3f(1.0), passed, water.coverage), 1.0);
}

@fragment
fn fs_light(input: VertexOutput) -> @location(0) vec4f {
  let water = sampleWater(input.uv);

  let viewPosition = input.viewPosition;
  let normal = waterNormal();
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
  surface.alpha = perceptualRoughnessToAlpha(params.roughness);

  let lit = accumulatePbrLighting(
    surface,
    spotLightShadowParams.hasSpotShadow,
    spotLightShadowParams.lightIndex
  );

  let sunShadow = cloudShadowFactor * directionalShadowFactor;
  let direct = (lit.directionalDiffuse + lit.directionalSpecular) * sunShadow
             + lit.punctualDiffuse + lit.punctualSpecular
             + (lit.spotShadowDiffuse + lit.spotShadowSpecular) * spotShadowFactor;
  let indirect = evaluateIbl(surface, params.roughness);

  // Last, so every shadow and cube sample above runs in uniform control flow.
  if (water.coverage <= 0.0) {
    discard;
  }
  return vec4f((direct + indirect) * water.coverage, 1.0);
}
