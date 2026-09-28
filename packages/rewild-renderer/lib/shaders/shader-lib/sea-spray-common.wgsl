// Sea spray (SeaSpray): a pool of particles that rise from breaking crests.
// The update pass spawns them; the draw pass animates and shades them. A
// particle keeps only where and when it rose, so its motion is a function of
// its age and the waves under it.

struct SprayParticle {
  // xy: world xz it rose from, at rest. z: seconds it rose at. w: seconds it
  // lives; 0 is a free slot.
  rise : vec4f,
  // x: 0..1 how hard the crest broke. y: 0..1 its own random value.
  shape : vec4f,
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
}
