struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct WireframeUniforms {
  color: vec4f
}
@group(1) @binding(0) var<uniform> wireframeUniforms : WireframeUniforms;


struct VertexInput {
    @location(0) position : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
}

@vertex
fn vs(
  input: VertexInput
) -> VertexOutput {
  var output : VertexOutput;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  return output;
}

@fragment
fn fs() -> @location(0) vec4f {
  return wireframeUniforms.color;
}