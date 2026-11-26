// Makes one mip level from the level above it. Each output texel takes the
// linear sample at its centre, which averages the 2 by 2 texels above it.
// The texels are premultiplied, so the average does not darken edges.

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

// One triangle that covers the target.
@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var output: VertexOut;
  output.position = vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.uv = uv;
  return output;
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  return textureSampleLevel(source, linearSampler, input.uv, 0.0);
}
