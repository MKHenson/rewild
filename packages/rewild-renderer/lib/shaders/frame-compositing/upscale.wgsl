// Scales the tone-mapped frame to the canvas with a bilinear filter.

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let pos = array(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );

  var out: VSOut;
  let xy = pos[vertexIndex];
  out.position = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
  return out;
}

@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var frameSampler: sampler;

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(frame, frameSampler, in.uv, 0.0).rgb, 1.0);
}
