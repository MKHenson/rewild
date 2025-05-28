struct Uniforms {
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}
@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct Lightint {
  direciton : vec3f,
  intensity : f32,
  color : vec3f,
  padding : f32,
}
@binding(0) @group(2) var<uniform> lighting : Lightint;

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
  output.normal = input.normal;
  return output;
}

@group(1) @binding(0) var mySampler: sampler;
@group(1) @binding(1) var myTexture: texture_2d<f32>;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var seamlessSampler: sampler;

@fragment
fn fs(
  @location(0) fragUV: vec2f,
  @location(1) normal: vec3f,
) -> @location(0) vec4f {
  // Scale the UVs to reduce tiling
  let scaledUV = fragUV * 25.0;

  // Generate a random offset based on UVs
  let k = textureSample(albedoTexture, seamlessSampler, scaledUV * 0.005).x; // Variation pattern
  let index = k * 8.0;
  let i = floor(index);
  let f = fract(index);

  // Compute offsets for virtual patterns
  let offa = sin(vec2f(3.0, 7.0) * (i + 0.0));
  let offb = sin(vec2f(3.0, 7.0) * (i + 1.0));

  // Sample the two closest virtual patterns
  let cola = textureSample(albedoTexture, seamlessSampler, scaledUV + offa).rgb;
  let colb = textureSample(albedoTexture, seamlessSampler, scaledUV + offb).rgb;

  // Interpolate between the two virtual patterns
  let blendedColor = mix(cola, colb, smoothstep(0.2, 0.8, f - 0.1 * dot(cola - colb, vec3f(1.0, 1.0, 1.0))));

  let normalizedNormal = normalize(normal);
  let directionLighting = dot(  normalizedNormal, -lighting.direciton) * lighting.intensity * lighting.color;

  // Combine the textures
  return textureSample(myTexture, mySampler, fragUV) * vec4f(blendedColor * directionLighting, 1.0);
}