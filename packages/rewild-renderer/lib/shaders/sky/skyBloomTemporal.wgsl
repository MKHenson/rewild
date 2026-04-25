// Temporal stabilization pass for bloom.
//
// Blends the current frame's V-pass bloom with a history buffer to suppress
// the frame-to-frame shimmer that occurs when cloud noise pixels oscillate
// across the bloom threshold. The blendFactor controls how much of the
// history is retained (0.85 ≈ 6-frame time constant at 60 fps).

struct TemporalUniforms {
    blendFactor: f32,
};

@group(0) @binding(0) var ourSampler:    sampler;
@group(0) @binding(1) var currentBloom:  texture_2d<f32>;
@group(0) @binding(2) var historyBloom:  texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: TemporalUniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
  );
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let dims    = vec2f(textureDimensions(currentBloom));
  let uv      = fragCoord.xy / dims;
  let current = textureSampleLevel(currentBloom, ourSampler, uv, 0.0);
  let history = textureSampleLevel(historyBloom, ourSampler, uv, 0.0);
  // Blend toward history to dampen temporal noise; history decays naturally
  // when the underlying brightness changes across multiple frames.
  return mix(current, history, uniforms.blendFactor);
}
