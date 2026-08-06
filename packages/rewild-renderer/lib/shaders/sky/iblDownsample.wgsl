// Box-downsamples one cube face from mip n-1 into mip n.
//
// A local copy rather than MipMapGenerator, which owns its own encoder and
// allocates a bind group per level per call. This runs on the prefilter's
// amortised schedule — up to several times a second while the sky moves — so
// its resources are built once and it shares the sky's command encoder.
//
// Faces are filtered independently, so edge texels average against a clamped
// edge rather than the neighbouring face. That is a seam, and it is accepted:
// the consumers are a cosine convolution and a roughness blur, both of which
// smear far wider than the error, and by the levels where a face is 2x2 the
// notion of an edge texel has stopped meaning anything.

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );

  let xy = pos[vertexIndex];
  var out: VertexOutput;
  out.position = vec4f(xy, 0.0, 1.0);
  // NDC -> uv with v flipped, so the sampled orientation matches the write.
  out.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
  return out;
}

@group(0) @binding(0) var sourceLevel: texture_2d<f32>;
@group(0) @binding(1) var levelSampler: sampler;

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  // A bilinear tap at the centre of each destination texel averages exactly the
  // four source texels beneath it, so no explicit 2x2 gather is needed.
  return textureSampleLevel(sourceLevel, levelSampler, in.uv, 0.0);
}
