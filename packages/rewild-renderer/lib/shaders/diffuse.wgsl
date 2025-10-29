struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct Lighting {
  direction : vec3f,
  intensity : f32,
  color : vec3f,
  padding : f32,
}
@group(2) @binding(0) var<uniform> lighting : Lighting;

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) normal : vec3f,
}

@vertex
fn vs(
  input: VertexInput
) -> VertexOutput {
  var output : VertexOutput;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;

  output.fragUV = input.uv;
  output.normal = uniforms.normalMatrix * input.normal; 
  return output;
}

@group(1) @binding(0) var mySampler: sampler;
@group(1) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f
) -> @location(0) vec4f {

  let normalizedNormal = normalize(normal);
  let directionLighting = dot(  normalizedNormal, -lighting.direction) * lighting.intensity * lighting.color;
  return textureSample(myTexture, mySampler, fragUV) * vec4f(directionLighting, 1.0);
}