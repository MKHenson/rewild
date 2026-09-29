// Sea spray (SeaSpray): a pool of particles that rise from breaking crests.
// The update pass spawns them; the draw pass animates and shades them. A
// particle keeps only where and when it rose, so its motion is a function of
// its age and the waves under it. The pool's first particles belong to the
// shore: surf from breaking shore waves, and plumes where crests hit rock.

// A particle's kind.
const SPRAY_OPEN: f32 = 0.0;
const SPRAY_SURF: f32 = 1.0;
const SPRAY_IMPACT: f32 = 2.0;

struct SprayParticle {
  // xy: world xz it rose from, at rest. z: seconds it rose at. w: seconds it
  // lives; 0 is a free slot.
  rise : vec4f,
  // x: 0..1 how hard the crest broke. y: 0..1 its own random value. z: its
  // kind. w: unused.
  shape : vec4f,
  // xy: metres a second it moves over the ground besides the wind. zw:
  // unused.
  motion : vec4f,
}

struct SprayParams {
  // xyz: camera world position. w: seconds on the spray clock.
  camera : vec4f,
  // xy: the direction the wind blows. z: windiness 0..1. w: sea level.
  wind : vec4f,
  // xy: world xz of the depth mask's centre. z: metres per mask texel. w:
  // frame counter, for fresh random numbers.
  mask : vec4f,
  // x: foam coverage a crest needs to throw spray. y: metres a spray puff
  // spans at full strength. z: metres it rises at full strength. w: seconds
  // it lives.
  shape : vec4f,
  // x: metres from the camera spray reaches. y: windiness below which none
  // rises. z: opacity. w: metres per second it drifts downwind in full wind.
  reach : vec4f,
  // rgb: the sun's radiance, 0 at night. w: unused.
  sun : vec4f,
  // Camera-relative world to clip, and back.
  viewProj : mat4x4f,
  invViewProj : mat4x4f,
  // xyz: the camera's right and up in world space.
  right : vec4f,
  up : vec4f,
  // Surf from breaking shore waves, and plumes where crests hit rock: x metres
  // across at full strength, y metres it rises, z seconds it lives, w opacity.
  surf : vec4f,
  impact : vec4f,
  // x: the first particle of the open sea's share of the pool. y: windiness
  // below which no surf rises. z: metres of wave height a plume needs. w:
  // metres of wave height at which surf and plumes are at full strength.
  shore : vec4f,
}
