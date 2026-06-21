struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
  // Quad covering the bottom-left quarter of the screen in NDC.
  var ndcPos = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(0.0, -1.0), vec2f(0.0, -0.5),
    vec2f(-1.0, -1.0), vec2f(0.0, -0.5), vec2f(-1.0, -0.5),
  );
  var uvCoord = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0),
  );
  var out: VertexOutput;
  out.pos = vec4f(ndcPos[vi], 0.0, 1.0);
  out.uv = uvCoord[vi];
  return out;
}

@group(0) @binding(0) var shadowAtlas: texture_depth_2d;

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  let dims = vec2f(textureDimensions(shadowAtlas));
  let coords = vec2i(dims * in.uv);
  let depth = textureLoad(shadowAtlas, coords, 0);
  // pow remap: shadow depths cluster near 1.0 — this spreads the visible range.
  let d = pow(depth, 0.2);
  return vec4f(d, d, d, 1.0);
}
