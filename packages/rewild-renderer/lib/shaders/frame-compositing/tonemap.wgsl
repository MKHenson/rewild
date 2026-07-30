// Whole-frame tonemap: the single point where HDR scene radiance becomes
// displayable colour.
//
// Everything upstream now works in HDR — the scene pass, the sky/cloud blend,
// and the atmosphere composite that blends fog and god rays over the scene.
// This pass applies exposure, folds in bloom, runs one ACES curve over the
// whole image, and writes the 8-bit swapchain.
//
// Note: the scene and sky are still on radiance scales that differ by ~100x, so
// geometry reads far too dark through this curve. Falloff is now inverse-square
// on the sky's scale, but the light intensities feeding it are still the values
// authored against the old linear ramp; converting them is what closes the gap.

struct OutputUniforms {
  lightningFlash: f32,
  // Maps HDR radiance into the ACES curve's useful range; `Camera.exposure`,
  // which is where the documentation for it lives. The ray-coverage heuristic
  // in skyComposite.wgsl reasons about post-exposure brightness and reads the
  // same camera value.
  exposure: f32,
  _pad0: f32,
  _pad1: f32,
};

struct VSOut {
  @builtin(position) position: vec4f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // One oversized triangle covering the viewport — no vertex buffer.
  let pos = array(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );

  var out: VSOut;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return out;
}

@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomSampler: sampler;
@group(0) @binding(3) var<uniform> uniforms: OutputUniforms;

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let texel = vec2i(in.position.xy);

  // The HDR scene target is always canvas-sized, so this is an exact 1:1 fetch.
  let sceneHDR = textureLoad(sceneTexture, texel, 0).rgb;

  // Bloom is generated at a reduced resolution, so it is sampled rather than
  // fetched. Added before the tone curve so the ACES shoulder compresses
  // bright+bloom into a smooth glow instead of clipping it into a hard ring.
  let dims = vec2f(textureDimensions(sceneTexture));
  let uv = (vec2f(in.position.xy)) / dims;
  let bloom = textureSampleLevel(bloomTexture, bloomSampler, uv, 0.0).rgb;

  var color = tonemapACES(uniforms.exposure * (sceneHDR + bloom));

  // Lightning screen flash: brightest at centre, dimmed at edges. Applied after
  // the curve, as it did when it lived in the sky composite — it represents the
  // eye being overwhelmed, not extra scene radiance.
  let flashVignette = 1.0 - smoothstep(0.3, 1.0, length(uv - vec2f(0.5, 0.5)));
  color += uniforms.lightningFlash * 0.7 * (0.6 + flashVignette * 0.4);

  // Half an LSB of triangular noise. ACES compresses a night sky into a handful
  // of 8-bit levels, and a smooth gradient across so few steps reads as contour
  // banding; sub-LSB noise pushes pixels across the rounding threshold in
  // proportion to where they sit between levels, so the eye integrates the steps
  // back into a gradient.
  return vec4f(color + triangularDither(in.position.xy), 1.0);
}

// Triangular-PDF dither in units of one 8-bit level. Two independent uniform
// hashes summed give a triangular distribution, which is the right shape for
// quantisation noise: it decorrelates the error from the signal, so banding does
// not simply become a lower-contrast band. Static per pixel — a time-varying
// pattern would shimmer on a still camera.
fn triangularDither(pixel: vec2f) -> f32 {
    let n1 = fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453);
    let n2 = fract(sin(dot(pixel, vec2f(93.9898, 67.345))) * 24634.6345);
    return (n1 + n2 - 1.0) / 255.0;
}

// https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
fn tonemapACES(x: vec3f) -> vec3f {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3f(0.0), vec3f(1.0));
}
