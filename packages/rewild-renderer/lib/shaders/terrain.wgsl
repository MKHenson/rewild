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
  output.Position = vec4<f32>( position.xyz / 2.0, 1.0 );
  output.fragUV = uv;
  return output;
}

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f,
) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV) * vec4f(1.0, 1.0, 1.0, 0.4);
}