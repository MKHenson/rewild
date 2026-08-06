#include "iblCommon.wgsl"

// Prefiltered specular radiance: one cube face of one roughness level per draw.
//
// This is the first half of Karis's split-sum approximation. The true integral
// depends on the view direction; the approximation drops that by assuming
// N = V = R, which is what makes the result storable in a cube at all. The cost
// is that reflections stay radially symmetric where a real one would stretch at
// grazing angles. Every engine that ships prefiltered IBL makes this trade.

struct SpecularUniforms {
  /** Which cube face this draw writes. */
  faceIndex: u32,
  /** Samples in the estimator. */
  sampleCount: u32,
  /** Perceptual roughness this mip stands for: mipIndex / (mipCount - 1). */
  roughness: f32,
  /** Edge length of the source cube's mip 0 — sets the texel solid angle. */
  sourceSize: f32,
  /** Edge length of the mip being written, to turn fragCoord into face uv. */
  destSize: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var sourceCube: texture_cube<f32>;
@group(0) @binding(1) var cubeSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: SpecularUniforms;

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

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / uniforms.destSize;
  let n = cubeDirection(uniforms.faceIndex, uv);
  // The split-sum simplification, stated once: the view direction is the normal.
  let v = n;

  // Solid angle of one source texel, for the mip selection below.
  let saTexel =
    4.0 * IBL_PI / (6.0 * uniforms.sourceSize * uniforms.sourceSize);

  var color = vec3f(0.0);
  var weight = 0.0;

  for (var i = 0u; i < uniforms.sampleCount; i = i + 1u) {
    let xi = hammersley(i, uniforms.sampleCount);
    let h = importanceSampleGGX(xi, n, uniforms.roughness);
    let l = normalize(2.0 * dot(v, h) * h - v);

    let nDotL = dot(n, l);
    if (nDotL <= 0.0) {
      continue;
    }

    let nDotH = max(dot(n, h), 0.0);
    // Equal to nDotH given V == N; written out so the derivation stays legible.
    let hDotV = max(dot(h, v), 0.0);

    // Pick a source mip from how much solid angle this sample represents. A
    // sparse, wide lobe reads a coarse level; a tight one reads mip 0. Without
    // this the estimator produces fireflies wherever the source has detail
    // finer than the sample spacing — at night that is every star, which is
    // exactly the aliasing #199 deferred to here.
    let d = distributionGGX(nDotH, uniforms.roughness);
    let pdf = d * nDotH / (4.0 * hDotV) + 1e-4;
    let saSample = 1.0 / (f32(uniforms.sampleCount) * pdf + 1e-4);
    let mip = max(0.0, 0.5 * log2(saSample / saTexel));

    color += textureSampleLevel(sourceCube, cubeSampler, l, mip).rgb * nDotL;
    weight += nDotL;
  }

  // Dividing by summed nDotL rather than by sampleCount is what keeps the
  // result energy-neutral once the below-horizon samples have been rejected.
  return vec4f(color / max(weight, 1e-4), 1.0);
}
