const MAX_LIGHTS = 4;

struct Light {
  positionOrDirection : vec3f,
  intensity : f32,
  color : vec3f,
  range : f32,
}

struct LightingUniforms {
  lights : array<Light, MAX_LIGHTS>,
  numLights : u32,
  padding1 : f32,
  padding2 : f32,
  padding3 : f32,
}