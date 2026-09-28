// Sea spray update (SeaSpray). One thread per particle. A live particle is
// left alone. A free or finished one tries a few random spots around the
// camera and rises from the first that is open sea under a breaking crest.

#include "./shader-lib/sea-spray-common.wgsl"
#include "./shader-lib/water-waves.wgsl"

// Random spots a free particle tries each frame.
const SPAWN_TRIES: u32 = 4u;
// Metres of water a spot needs: shallower, the waves are calmed (water.wgsl).
const MIN_DEPTH: f32 = 1.5;

@group(0) @binding(0) var<uniform> params : SprayParams;
@group(0) @binding(1) var<storage, read_write> particles : array<SprayParticle>;
@group(0) @binding(2) var<uniform> waves : Waves;
@group(0) @binding(3) var oceanDisplacement : texture_2d_array<f32>;
@group(0) @binding(4) var oceanSampler : sampler;
// Metres of sea around the camera per texel, 0 on land or unknown ground.
@group(0) @binding(5) var depthMask : texture_2d<f32>;

fn pcg(v : u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn unit(h : u32) -> f32 {
  return f32(h >> 8u) * (1.0 / 16777216.0);
}

// Metres of sea at world xz, from the nearest mask texel.
fn seaDepth(world : vec2f) -> f32 {
  let size = vec2i(textureDimensions(depthMask));
  let texel = vec2i(floor((world - params.mask.xy) / params.mask.z + vec2f(size) * 0.5));
  if (any(texel < vec2i(0)) || any(texel >= size)) {
    return 0.0;
  }
  return textureLoad(depthMask, texel, 0).r;
}

// The ocean's foam coverage at world xz, as the water shader sums it for the
// palette's first type, the ocean.
fn foamAt(world : vec2f) -> f32 {
  let rest = world - waves.origin.xy;
  var foam = 0.0;
  for (var c : i32 = 0; c < CASCADES; c++) {
    let w = waves.cascadeTypes[c].x;
    if (w <= 0.0) {
      continue;
    }
    foam += textureSampleLevel(oceanDisplacement, oceanSampler, cascadeUV(c, rest), c, 0.0).w * w;
  }
  return foam;
}

@compute @workgroup_size(64, 1, 1)
fn update(@builtin(global_invocation_id) id : vec3u) {
  let index = id.x;
  if (index >= arrayLength(&particles)) {
    return;
  }
  let now = params.camera.w;
  let particle = particles[index];
  if (particle.rise.w > 0.0 && now - particle.rise.z < particle.rise.w) {
    return;
  }

  var next = SprayParticle(vec4f(0.0), vec4f(0.0));
  let chance = smoothstep(params.reach.y, params.reach.y + 0.3, params.wind.z);
  let frame = u32(params.mask.w);
  for (var t = 0u; t < SPAWN_TRIES; t++) {
    let seed = pcg(index * 7919u + pcg(frame * SPAWN_TRIES + t));
    if (unit(pcg(seed + 3u)) >= chance) {
      continue;
    }
    let offset = vec2f(unit(pcg(seed)), unit(pcg(seed + 1u))) * 2.0 - 1.0;
    if (dot(offset, offset) > 1.0) {
      continue;
    }
    let world = params.camera.xz + offset * params.reach.x;
    if (seaDepth(world) < MIN_DEPTH) {
      continue;
    }
    let foam = foamAt(world);
    if (foam < params.shape.x) {
      continue;
    }
    let random = unit(pcg(seed + 2u));
    let strength = saturate((foam - params.shape.x) / max(1.0 - params.shape.x, 1e-3));
    next.rise = vec4f(world, now, params.shape.w * mix(0.7, 1.3, random));
    next.shape = vec4f(strength, random, 0.0, 0.0);
    break;
  }
  particles[index] = next;
}
