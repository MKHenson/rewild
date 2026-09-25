#include "./shader-lib/total-lighting.wgsl"

struct Uniforms {
  normalMatrix: mat3x3f,
  projMatrix : mat4x4f,
  modelViewMatrix : mat4x4<f32>,
}

struct WaterParams {
  color : vec4f,
  // Texels per side of the water map.
  texels : f32,
}

struct VertexInput {
  @location(0) position : vec3f,
  @location(1) uv : vec2f,
}

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) uv : vec2f,
  @location(1) viewPosition : vec3f,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(0) var surfaceSampler : sampler;
// (level, terrain height, coverage, _) with heights relative to the base level,
// which the mesh transform carries.
@group(1) @binding(1) var surfaceMap : texture_2d<f32>;
@group(1) @binding(2) var<uniform> params : WaterParams;
@group(2) @binding(0) var<storage, read> lighting : LightingUniforms;

// Texels sit on the grid's vertices, so uv 0 and 1 land on texel centres.
fn surfaceUV(uv: vec2f) -> vec2f {
  return (uv * (params.texels - 1.0) + 0.5) / params.texels;
}

@vertex
fn vs(input: VertexInput) -> VertexOutput {
  let surface = textureSampleLevel(surfaceMap, surfaceSampler, surfaceUV(input.uv), 0.0);
  let local = vec4f(input.position.x, surface.r, input.position.z, 1.0);
  let viewPosition = uniforms.modelViewMatrix * local;

  var out: VertexOutput;
  out.Position = uniforms.projMatrix * viewPosition;
  out.uv = input.uv;
  out.viewPosition = viewPosition.xyz;
  return out;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  let coverage = textureSample(surfaceMap, surfaceSampler, surfaceUV(input.uv)).b;
  if (coverage <= 0.0) {
    discard;
  }

  let N = normalize(uniforms.normalMatrix * vec3f(0.0, 1.0, 0.0));
  var irradiance = vec3f(0.0);
  for (var i: u32 = 0; i < lighting.numLights; i++) {
    let light = lighting.lights[i];
    if (light.lightType == 1.0) {
      irradiance += light.color * light.intensity * max(dot(N, -light.positionOrDirection), 0.0);
    }
  }

  return vec4f(params.color.rgb / 3.14159265359 * irradiance, 1.0);
}
