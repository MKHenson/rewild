struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct GizmoUniforms {
  color: vec3f,
  opacity: f32,
}
@group(1) @binding(0) var<uniform> gizmoUniforms : GizmoUniforms;

struct VertexInput {
  @location(0) position : vec4<f32>,
  @location(1) normal : vec3<f32>,
};

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) normal : vec3f,
}

@vertex
fn vs(
  input: VertexInput
) -> VertexOutput {
  var output : VertexOutput;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = uniforms.modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;
  output.normal = uniforms.normalMatrix * input.normal;
  return output;
}

@fragment
fn fs(
  @location(0) normal: vec3f,
) -> @location(0) vec4f {
  let n = normalize(normal);

  // Simple hemisphere shading: normals facing the camera are brighter
  let shade = 0.45 + 0.55 * max(dot(n, vec3f(0.0, 0.0, 1.0)), 0.0);

  return vec4f(gizmoUniforms.color * shade, gizmoUniforms.opacity);
}
