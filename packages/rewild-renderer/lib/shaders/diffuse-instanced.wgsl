struct Uniforms {
  projMatrix : mat4x4f,
}
@group(1) @binding(0) var<uniform> uniforms : Uniforms;

const MAX_LIGHTS = 4;

struct Light {
  direction : vec3f,
  intensity : f32,
  color : vec3f,
  padding : f32,
}

struct LightingUniforms {
  lights : array<Light, MAX_LIGHTS>,
  numLights : u32,
  padding1 : f32,
  padding2 : f32,
  padding3 : f32,
}

@group(3) @binding(0) var<uniform> lighting : LightingUniforms;

struct Transform {
    modelViewMatrix : mat4x4<f32>,
    normalMatrix : mat3x3<f32>,
};

@group(2) @binding(0) var<storage, read> transforms : array<Transform>;


struct VertexInput {
    @location(0) position : vec4<f32>,
    @location(1) uv : vec2<f32>,
    @location(2) normal : vec3<f32>,
    @builtin(instance_index) instanceIndex: u32
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

  let transform = transforms[input.instanceIndex];
  let modelViewMatrix = transform.modelViewMatrix;

  var mvPosition = vec4<f32>( input.position.xyz, 1.0 );
  mvPosition = modelViewMatrix * mvPosition;
  output.Position = uniforms.projMatrix * mvPosition;

  output.normal = transform.normalMatrix * input.normal;

  output.fragUV = input.uv;
  return output;
}

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_2d<f32>;

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f
) -> @location(0) vec4f {
  let normalizedNormal = normalize(normal);
  var totalLight = vec3f(0.0, 0.0, 0.0);

  for (var i: u32 = 0; i < lighting.numLights; i++) {
      let light = lighting.lights[i];
      let diffuse = max(dot(normalizedNormal, -light.direction), 0.0);
      totalLight += diffuse * light.intensity * light.color;
  }

  return textureSample(myTexture, mySampler, fragUV) * vec4f(totalLight, 1.0);
}