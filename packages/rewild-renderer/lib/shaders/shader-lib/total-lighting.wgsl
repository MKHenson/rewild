struct Light {
  positionOrDirection : vec3f,
  intensity : f32,
  color : vec3f,
  range : f32,
}

struct LightingUniforms {
  numLights : u32,
  lights : array<Light>,
}