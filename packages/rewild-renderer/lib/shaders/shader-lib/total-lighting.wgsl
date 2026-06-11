// lightType: 0 = point, 1 = directional, 2 = spot
struct Light {
  positionOrDirection : vec3f,  // point/spot: view-space position; directional: view-space direction
  intensity : f32,
  color : vec3f,
  range : f32,                  // point/spot: cutoff distance
  direction : vec3f,            // spot: view-space cone axis
  lightType : f32,
  innerAngle : f32,             // spot: inner cone half-angle in radians
  outerAngle : f32,             // spot: outer cone half-angle in radians
  _pad0 : f32,
  _pad1 : f32,
}

struct LightingUniforms {
  numLights : u32,
  lights : array<Light>,
}