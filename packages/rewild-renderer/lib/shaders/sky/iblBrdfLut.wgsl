#include "iblCommon.wgsl"

// Split-sum BRDF integration map — the second half of the approximation.
//
// Stores, per (NdotV, roughness), the scale and bias to apply to F0:
//   specular = prefilteredColor * (F0 * lut.r + lut.g)
// It depends on nothing but the BRDF, so it is generated once at startup and
// never touched again — no scene, no sky, no time of day enters it.
//
// UV convention x is NdotV, y is roughness, both
// 0..1, sampled as textureSample(brdfLut, s, vec2f(nDotV, roughness)).

struct BrdfLutUniforms {
  /** Edge length of the LUT, to turn fragCoord into the parameter pair. */
  size: f32,
  /** Samples per texel. */
  sampleCount: u32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: BrdfLutUniforms;

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

fn geometrySchlickGGX(nDotX: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let k = a * 0.5;
  return nDotX / (nDotX * (1.0 - k) + k);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec2f {
  let uv = fragCoord.xy / uniforms.size;

  // NdotV of exactly 0 divides by zero in the visibility ratio below, and the
  // first texel centre is only half a texel away from it.
  let nDotV = max(uv.x, 1e-3);
  let roughness = uv.y;

  // Everything is done in a tangent frame with N along +Z, so V is fixed by
  // NdotV alone and the whole integral is two-dimensional.
  let v = vec3f(sqrt(1.0 - nDotV * nDotV), 0.0, nDotV);
  let n = vec3f(0.0, 0.0, 1.0);

  var scale = 0.0;
  var bias = 0.0;

  for (var i = 0u; i < uniforms.sampleCount; i = i + 1u) {
    let xi = hammersley(i, uniforms.sampleCount);
    let h = importanceSampleGGX(xi, n, roughness);
    let l = normalize(2.0 * dot(v, h) * h - v);

    let nDotL = l.z;
    if (nDotL <= 0.0) {
      continue;
    }

    let nDotH = max(h.z, 0.0);
    let vDotH = max(dot(v, h), 0.0);

    let g = geometrySchlickGGX(nDotV, roughness) *
            geometrySchlickGGX(nDotL, roughness);
    // The importance-sampling pdf cancels D and most of the denominator, which
    // is what leaves this compact ratio rather than the full BRDF.
    let gVis = (g * vDotH) / max(nDotH * nDotV, 1e-6);

    // Schlick's Fresnel, factored so F0 can be pulled out of the integral —
    // the whole reason this is storable as a two-channel table.
    let fc = pow(1.0 - vDotH, 5.0);
    scale += (1.0 - fc) * gVis;
    bias += fc * gVis;
  }

  let inv = 1.0 / f32(uniforms.sampleCount);
  return vec2f(scale * inv, bias * inv);
}
