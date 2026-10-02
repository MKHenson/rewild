// Fog in the water (UnderWaterFog). Where the lens is under water
// (lensInWater), the atmosphere composite leaves the pixel alone and these two
// draws take its place: `fs_absorb` multiplies the scene by what survives the trip through
// the water, per channel, and `fs_scatter` adds what the water scatters into
// the ray. Water writes depth, so a pixel looking up stops at the surface.

#include "../shader-lib/under-water.wgsl"
#include "../shader-lib/water-fog.wgsl"
#include "./atmosphere-uniforms.wgsl"

// Metres a pixel that hits nothing is taken to reach: past it no light
// survives.
const ENDLESS: f32 = 1e4;

@group(0) @binding(0) var<uniform> object : FinalUniformStruct;
@group(0) @binding(1) var depthTexture : texture_depth_2d;
@group(0) @binding(2) var<uniform> underWater : UnderWater;
@group(0) @binding(3) var iblIrradianceMap : texture_cube<f32>;
@group(0) @binding(4) var iblSampler : sampler;

struct Ray {
  dir : vec3f,
  distance : f32,
}

fn viewRay(fragCoord: vec4f) -> Ray {
  let uv = fragCoord.xy / vec2f(object.resolution);
  let rawDepth = textureLoad(depthTexture, vec2i(fragCoord.xy), 0);
  let clip = vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, rawDepth, 1.0);
  let world = object.invViewProjectionMatrix * clip;
  let offset = world.xyz / world.w - object.cameraPosition;
  var ray: Ray;
  ray.dir = normalize(offset);
  ray.distance = select(length(offset), ENDLESS, rawDepth >= 1.0);
  return ray;
}

@fragment
fn fs_absorb(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let ray = viewRay(fragCoord);
  if (!lensInWater(ray.dir)) {
    discard;
  }
  return vec4f(waterTransmittanceAlong(ray.distance), 1.0);
}

@fragment
fn fs_scatter(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  // The cube holds irradiance over π.
  let sky = textureSampleLevel(iblIrradianceMap, iblSampler, vec3f(0.0, 1.0, 0.0), 0.0).rgb * WATER_PI;
  let ray = viewRay(fragCoord);
  if (!lensInWater(ray.dir)) {
    discard;
  }
  return vec4f(waterInScatter(ray.dir, cameraWaterDepth(), cameraBedBelow(), ray.distance, sky), 1.0);
}
