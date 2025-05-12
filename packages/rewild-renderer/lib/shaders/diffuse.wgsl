struct Uniforms {
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
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
  return output;
}

@group(1) @binding(0) var mySampler: sampler;
@group(1) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f
) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV);
}