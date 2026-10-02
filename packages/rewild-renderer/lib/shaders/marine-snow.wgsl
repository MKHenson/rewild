// Marine snow (MarineSnow): specks in a box that wraps around the camera.
// Where a speck sits is a hash of its instance, moved by a slow current the
// CPU carries, so nothing is simulated. It sways with the long cascade's
// displacement, fading with depth as a wave's orbits do. It is lit by the sun
// and the sky through the water above it, focused by the caustics, and dimmed
// along the view. It draws after the atmosphere composite, so the water's fog
// is applied here, and only below the surface.

#include "./shader-lib/under-water.wgsl"
#include "./shader-lib/water-fog.wgsl"
#include "./shader-lib/caustics.wgsl"
#include "./shader-lib/water-waves.wgsl"

// The swell's sway falls by e every SWAY_DEPTH metres down.
const SWAY_DEPTH: f32 = 16.0;
// Share of the light reaching a speck it scatters.
const SNOW_ALBEDO: f32 = 0.9;
// Metres from the camera over which a speck fades in.
const NEAR_FADE: f32 = 0.5;
// Share of the box's half-width over which a speck fades out at its edge.
const EDGE_FADE: f32 = 0.3;

struct SnowParams {
  // Clip space from metres relative to the camera.
  viewProjection : mat4x4f,
  // xyz: where the current has moved the specks, over the box, 0..1. w:
  // brightness.
  place : vec4f,
  // xy: the camera's xz from the waves' origin. z: the camera's water's
  // weight on the longest cascade.
  camera : vec4f,
  // x: the box's metres. y: a speck's metres. z: the fewest pixels a speck
  // covers; a smaller one fades instead. w: opacity.
  speck : vec4f,
  // xy: the target's pixels. z: pixels per unit of view slope.
  screen : vec4f,
}

@group(0) @binding(0) var<uniform> snow : SnowParams;
@group(0) @binding(1) var<uniform> underWater : UnderWater;
@group(0) @binding(2) var<uniform> waves : Waves;
@group(0) @binding(3) var oceanDisplacement : texture_2d_array<f32>;
@group(0) @binding(4) var oceanSampler : sampler;
@group(0) @binding(5) var causticsMap : texture_2d<f32>;
@group(0) @binding(6) var causticsSampler : sampler;
@group(0) @binding(7) var<uniform> caustics : CausticsParams;
@group(0) @binding(8) var irradiance : texture_cube<f32>;
@group(0) @binding(9) var irradianceSampler : sampler;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) corner : vec2f,
  @location(1) color : vec3f,
  @location(2) alpha : f32,
}

fn snowHash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x & 0xffffffu) / 16777216.0;
}

@vertex
fn vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) speck: u32) -> VertexOutput {
  var out: VertexOutput;
  let k = vertex % 6u;
  out.corner = vec2f(
    select(-1.0, 1.0, k == 1u || k == 4u || k == 5u),
    select(-1.0, 1.0, k == 2u || k == 3u || k == 5u)
  );
  out.color = vec3f(0.0);
  out.alpha = 0.0;
  out.position = vec4f(2.0, 2.0, 2.0, 1.0);

  let box = snow.speck.x;
  let id = speck * 4u;
  let seed = vec3f(snowHash(id), snowHash(id + 1u), snowHash(id + 2u));
  var offset = (fract(seed + snow.place.xyz + 0.5) - 0.5) * box;
  let below = cameraWaterDepth() - offset.y;
  let rest = snow.camera.xy + offset.xz;
  let swell = textureSampleLevel(oceanDisplacement, oceanSampler, cascadeUV(0, rest), 0, 0.0).xyz;
  offset += swell * snow.camera.z * exp(-max(below, 0.0) / SWAY_DEPTH);
  let depth = cameraWaterDepth() - offset.y;
  if (depth <= 0.0 || !cameraInWater()) {
    return out;
  }

  let distance = length(offset);
  let dir = offset / max(distance, 1e-4);
  let fade = smoothstep(0.0, NEAR_FADE, distance) * (1.0 - smoothstep((1.0 - EDGE_FADE) * 0.5 * box, 0.5 * box, distance));
  let clip = snow.viewProjection * vec4f(offset, 1.0);
  if (clip.w <= 0.0 || fade <= 0.0) {
    return out;
  }
  let pixels = snow.speck.y * mix(0.5, 1.5, snowHash(id + 3u)) * snow.screen.z / clip.w;
  let shown = max(pixels, snow.speck.z);
  let thin = pixels / shown;

  let sigma = underWater.extinction.rgb;
  let sky = textureSampleLevel(irradiance, irradianceSampler, vec3f(0.0, 1.0, 0.0), 0.0).rgb * WATER_PI;
  var light = sky * exp(-sigma * depth * WATER_SKY_SLANT);
  let mu = underWater.sun.a;
  if (mu > 0.0) {
    let focus = causticLight(causticsPlace(offset.xz), depth, 0.0, caustics.water.x);
    light += underWater.sun.rgb * exp(-sigma * depth / mu) * focus * waterPhase(dot(dir, underWater.sunDirection.xyz));
  }

  out.position = clip + vec4f(out.corner * shown / snow.screen.xy * clip.w, 0.0, 0.0);
  out.color = SNOW_ALBEDO * light / (4.0 * WATER_PI) * waterTransmittanceAlong(distance) * snow.place.w;
  out.alpha = snow.speck.w * thin * thin * fade;
  return out;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  let a = input.alpha * (1.0 - smoothstep(0.4, 1.0, length(input.corner)));
  if (a <= 0.0) {
    discard;
  }
  return vec4f(input.color * a, a);
}
