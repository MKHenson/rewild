struct Uniforms {
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@binding(0) @group(1) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
  @location(1) fragPosition: vec4f,
}

@vertex
fn vs(
  @location(0) position : vec4f,
  @location(1) uv : vec2f
) -> VertexOutput {
  var output : VertexOutput;

  var mvPosition = vec4<f32>( position.xyz, 1.0 );
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.fragUV = uv;
  return output;
}

@binding(0) @group(0)  var mySampler: sampler;
@binding(1) @group(0) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f,
) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV) * vec4f(1.0, 1.0, 1.0, 0.4);
}