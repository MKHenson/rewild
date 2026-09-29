// Sea spray update (SeaSpray). One thread per particle. A live particle is
// left alone. A free or finished one tries a few random spots around the
// camera. The open sea's share of the pool rises from the first spot that is
// open sea under a breaking crest. The shore's share rises as a plume where a
// crest hits rock, or as surf where a shore wave breaks, as its crest passes.

#include "./shader-lib/sea-spray-common.wgsl"
#include "./shader-lib/water-waves.wgsl"
#include "./shader-lib/shore-waves.wgsl"

// Random spots a free particle tries each frame.
const SPAWN_TRIES: u32 = 4u;
// Metres of water a spot needs: shallower, the waves are too small to throw spray.
const MIN_DEPTH: f32 = 1.5;
// The palette's first type, the ocean.
const OCEAN_WEIGHTS: vec4f = vec4f(1.0, 0.0, 0.0, 0.0);
// A shore wave throws spray while the two trains together stand above this
// share of the height they reach at that moment: at its crest, as it breaks
// or hits. A set's big waves, where the trains align, throw the most.
const CREST_LEVEL: f32 = 0.85;
// Metres of water beside land deep enough that a crest hits it unbroken: a
// rock face, not a beach.
const IMPACT_DEPTH: f32 = 2.5;
// An open-sea crest hits rock when it stands this share of the sea's
// significant height above rest.
const IMPACT_CREST: f32 = 0.35;
// Surf needs a wave this near breaking.
const SURF_BREAKING: f32 = 0.3;
// Share of a shore wave's speed that surf is carried shoreward at, so it keeps
// up with the crest that threw it.
const SURF_CARRY: f32 = 0.9;

@group(0) @binding(0) var<uniform> params : SprayParams;
@group(0) @binding(1) var<storage, read_write> particles : array<SprayParticle>;
@group(0) @binding(2) var<uniform> waves : Waves;
@group(0) @binding(3) var oceanDisplacement : texture_2d_array<f32>;
@group(0) @binding(4) var oceanSampler : sampler;
// Metres of sea around the camera per texel: 0 on land, -1 where the ground
// is not loaded.
@group(0) @binding(5) var depthMask : texture_2d<f32>;
// The shore field (ShoreField) and a clamped sampler for it.
@group(0) @binding(6) var shoreMap : texture_2d<f32>;
@group(0) @binding(7) var shoreSampler : sampler;

fn pcg(v : u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn unit(h : u32) -> f32 {
  return f32(h >> 8u) * (1.0 / 16777216.0);
}

// Metres of sea at world xz, from the nearest mask texel: 0 on land, -1
// where the ground is unknown or past the mask.
fn seaDepth(world : vec2f) -> f32 {
  let size = vec2i(textureDimensions(depthMask));
  let texel = vec2i(floor((world - params.mask.xy) / params.mask.z + vec2f(size) * 0.5));
  if (any(texel < vec2i(0)) || any(texel >= size)) {
    return -1.0;
  }
  return textureLoad(depthMask, texel, 0).r;
}

fn isLand(world : vec2f) -> bool {
  return seaDepth(world) == 0.0;
}

// Whether a mask texel next to world xz is known land.
fn besideLand(world : vec2f) -> bool {
  let across = params.mask.z;
  return isLand(world + vec2f(across, 0.0))
    || isLand(world - vec2f(across, 0.0))
    || isLand(world + vec2f(0.0, across))
    || isLand(world - vec2f(0.0, across));
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

// The open sea's height above rest at world xz, and its significant height.
fn openSea(world : vec2f) -> vec2f {
  let rest = world - waves.origin.xy;
  var lift = 0.0;
  var variance = 0.0;
  for (var c : i32 = 0; c < CASCADES; c++) {
    let w = waves.cascadeTypes[c].x;
    if (w <= 0.0) {
      continue;
    }
    lift += textureSampleLevel(oceanDisplacement, oceanSampler, cascadeUV(c, rest), c, 2.0).y * w;
    let rms = waves.cascade[c].y * w;
    variance += rms * rms;
  }
  return vec2f(lift, 4.0 * sqrt(variance));
}

// 0..1: whether the shore waves' crest is over a point `seconds` from deep
// water, as the water shader stacks the two trains. The trains' periods are
// close, so their sum is one wave whose height swells and fades over a set:
// its crest is where the sum stands near that height, and a set's big waves
// count more than the small ones between.
fn crestPassing(state : ShoreState, seconds : f32) -> f32 {
  let trains = SHORE_TRAIN_SHARE;
  var sum = vec2f(0.0);
  for (var i : i32 = 0; i < 2; i++) {
    let phase = shorePhase(i, seconds, state.wobble.x);
    sum += trains[i] * vec2f(cos(phase), sin(phase));
  }
  let envelope = length(sum);
  if (envelope <= 1e-4) {
    return 0.0;
  }
  let crest = smoothstep(CREST_LEVEL, 1.0, sum.x / envelope);
  return crest * mix(0.4, 1.0, envelope / (trains.x + trains.y));
}

// A shore particle rising at `world` on try `seed`, or none (rise.w 0).
fn spawnShore(world : vec2f, seed : u32, now : f32) -> SprayParticle {
  var next = SprayParticle(vec4f(0.0), vec4f(0.0), vec4f(0.0));
  let depth = seaDepth(world);
  if (depth <= 0.0) {
    return next;
  }
  let rest = world - waves.origin.xy;
  let shore = textureSampleLevel(shoreMap, shoreSampler, shoreFieldUV(rest), 0.0);
  let state = shoreState(shore, rest, depth);
  let random = unit(pcg(seed + 2u));
  let roll = unit(pcg(seed + 5u));
  let full = max(params.shore.w, 1e-3);

  if (depth >= IMPACT_DEPTH && besideLand(world)) {
    // A crest hitting rock: a shore wave's as it arrives, or else a tall
    // open-sea crest.
    let sea = openSea(world);
    var height = sea.y;
    var hit = select(0.0, 1.0, sea.x > IMPACT_CREST * sea.y);
    if (state.fade > 0.0) {
      height = max(height, state.height);
      hit = max(hit, crestPassing(state, shore.x));
    }
    let strength = saturate((height - params.shore.z) / max(full - params.shore.z, 1e-3));
    if (strength <= 0.0 || roll >= strength * hit) {
      return next;
    }
    next.rise = vec4f(world, now, params.impact.z * mix(0.7, 1.3, random));
    next.shape = vec4f(strength, random, SPRAY_IMPACT, 0.0);
    return next;
  }

  if (state.fade <= 0.0 || state.breaking < SURF_BREAKING) {
    return next;
  }
  let windy = smoothstep(params.shore.y, params.shore.y + 0.3, params.wind.z);
  let strength = saturate(state.height / full) * state.breaking;
  if (roll >= strength * windy * crestPassing(state, shore.x)) {
    return next;
  }
  let carry = state.toCoast * (SURF_CARRY / max(state.slowness, 1e-3));
  next.rise = vec4f(world, now, params.surf.z * mix(0.7, 1.3, random));
  next.shape = vec4f(strength, random, SPRAY_SURF, 0.0);
  next.motion = vec4f(carry, 0.0, 0.0);
  return next;
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

  var next = SprayParticle(vec4f(0.0), vec4f(0.0), vec4f(0.0));
  let frame = u32(params.mask.w);
  let shoreSlot = f32(index) < params.shore.x;
  let chance = smoothstep(params.reach.y, params.reach.y + 0.3, params.wind.z);
  for (var t = 0u; t < SPAWN_TRIES; t++) {
    let seed = pcg(index * 7919u + pcg(frame * SPAWN_TRIES + t));
    let offset = vec2f(unit(pcg(seed)), unit(pcg(seed + 1u))) * 2.0 - 1.0;
    if (dot(offset, offset) > 1.0) {
      continue;
    }
    let world = params.camera.xz + offset * params.reach.x;

    if (shoreSlot) {
      next = spawnShore(world, seed, now);
      if (next.rise.w > 0.0) {
        break;
      }
      continue;
    }

    if (unit(pcg(seed + 3u)) >= chance) {
      continue;
    }
    let depth = seaDepth(world);
    if (depth < MIN_DEPTH) {
      continue;
    }
    // Shallow water holds only part of the sea (water.wgsl), so fewer and
    // smaller puffs rise from it.
    let held = seaHeld(depth, OCEAN_WEIGHTS);
    if (unit(pcg(seed + 4u)) >= held) {
      continue;
    }
    let foam = foamAt(world);
    if (foam < params.shape.x) {
      continue;
    }
    let random = unit(pcg(seed + 2u));
    let strength = saturate((foam - params.shape.x) / max(1.0 - params.shape.x, 1e-3)) * held;
    next.rise = vec4f(world, now, params.shape.w * mix(0.7, 1.3, random));
    next.shape = vec4f(strength, random, SPRAY_OPEN, 0.0);
    break;
  }
  particles[index] = next;
}
