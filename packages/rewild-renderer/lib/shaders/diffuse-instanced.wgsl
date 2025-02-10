struct Uniforms {
  projMatrix : mat4x4f,
}
@group(1) @binding(0) var<uniform> uniforms : Uniforms;

struct Transform {
    modelViewMatrix : mat4x4<f32>,
};

@group(2) @binding(0) var<storage, read> transforms : array<Transform>;


struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @builtin(instance_index) instanceIndex: u32
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

  let transform = transforms[input.instanceIndex];
  let modelViewMatrix = transform.modelViewMatrix;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;

  output.fragUV = input.uv;
  return output;
}

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f
) -> @location(0) vec4f {
  return textureSample(myTexture, mySampler, fragUV) * vec4f(1.0, 1.0, 1.0, 1);
}