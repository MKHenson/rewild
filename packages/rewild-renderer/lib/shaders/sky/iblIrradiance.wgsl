#include "iblCommon.wgsl"

// Diffuse irradiance: one cube face per draw.
//
// Integrates incoming radiance over the hemisphere around each texel's normal,
// cosine-weighted, and divides out pi so the result can be multiplied straight
// by albedo. Stored as a cube rather than spherical harmonics — at 16 per face
// the whole thing is 1536 texels, which is cheaper to produce than an SH
// projection and far easier to reason about when it looks wrong.

struct IrradianceUniforms {
  faceIndex: u32,
  sampleCount: u32,
  /** Edge length of the face being written. */
  destSize: f32,
  /**
   * Source mip to integrate. Deliberately not 0: irradiance is the smoothest
   * thing the prefilter produces, so integrating a pre-averaged level costs
   * nothing in accuracy and removes the variance that a few hundred samples
   * over point-like stars would otherwise leave.
   */
  sourceMip: f32,
};

@group(0) @binding(0) var sourceCube: texture_cube<f32>;
@group(0) @binding(1) var cubeSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: IrradianceUniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return out;
}

/** Cosine-weighted hemisphere sample in tangent space (z up). */
fn cosineSample(xi: vec2f) -> vec3f {
  let phi = 2.0 * IBL_PI * xi.x;
  // sqrt on xi.y is what makes the density proportional to cos(theta).
  let cosTheta = sqrt(1.0 - xi.y);
  let sinTheta = sqrt(max(0.0, xi.y));
  return vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / uniforms.destSize;
  let n = cubeDirection(uniforms.faceIndex, uv);

  var sum = vec3f(0.0);

  for (var i = 0u; i < uniforms.sampleCount; i = i + 1u) {
    let xi = hammersley(i, uniforms.sampleCount);
    let l = tangentToWorld(n, cosineSample(xi));
    sum += textureSampleLevel(sourceCube, cubeSampler, l, uniforms.sourceMip).rgb;
  }

  // Sampling cosine-weighted means the cos term and the 1/pi normalisation are
  // already folded into the density, so the estimator is a plain mean. The
  // result is irradiance/pi — i.e. exactly what multiplies albedo in a Lambert
  // term, with no further division at the shading site.
  return vec4f(sum / f32(uniforms.sampleCount), 1.0);
}
