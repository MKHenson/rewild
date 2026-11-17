// The glass backdrop: the image under the UI, blurred. A prefilter averages
// each 4 by 4 block of the source into a quarter size image. Then a dual
// Kawase blur halves the image a few times and doubles it back.

struct Params {
  // One texel of the source, in uv.
  texel: vec2f,
  // How far the Kawase taps reach, in source texels.
  offset: f32,
  // Above 0 for an HDR source: the prefilter applies this exposure and the
  // game's ACES curve, so the blur has the colours on screen.
  exposure: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  // One triangle that covers the target.
  let corner = vec2f(f32((vertexIndex << 1u) & 2u), f32(vertexIndex & 2u));
  var output: VertexOut;
  output.position = vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
  output.uv = vec2f(corner.x, 1.0 - corner.y);
  return output;
}

fn tap(uv: vec2f) -> vec3f {
  return textureSampleLevel(source, linearSampler, uv, 0.0).rgb;
}

// Must match tonemapACES in rewild-renderer's tonemap.wgsl.
fn tonemapACES(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn display(color: vec3f) -> vec3f {
  if (params.exposure > 0.0) {
    return tonemapACES(params.exposure * color);
  }
  return color;
}

// Four bilinear taps, each the mean of a 2 by 2 block, give the mean of the
// 4 by 4 block. The tone map runs on each tap, before the blur, so a bright
// sun does not spread a glow that the screen does not show.
@fragment
fn prefilter(input: VertexOut) -> @location(0) vec4f {
  let t = params.texel;
  let color =
    display(tap(input.uv + vec2f(-t.x, -t.y))) +
    display(tap(input.uv + vec2f(t.x, -t.y))) +
    display(tap(input.uv + vec2f(-t.x, t.y))) +
    display(tap(input.uv + vec2f(t.x, t.y)));
  return vec4f(color * 0.25, 1.0);
}

@fragment
fn down(input: VertexOut) -> @location(0) vec4f {
  let h = params.texel * params.offset;
  let uv = input.uv;
  let color =
    tap(uv) * 4.0 +
    tap(uv + vec2f(-h.x, -h.y)) +
    tap(uv + vec2f(h.x, h.y)) +
    tap(uv + vec2f(h.x, -h.y)) +
    tap(uv + vec2f(-h.x, h.y));
  return vec4f(color / 8.0, 1.0);
}

@fragment
fn up(input: VertexOut) -> @location(0) vec4f {
  let h = params.texel * params.offset;
  let uv = input.uv;
  let color =
    tap(uv + vec2f(-2.0 * h.x, 0.0)) +
    tap(uv + vec2f(2.0 * h.x, 0.0)) +
    tap(uv + vec2f(0.0, -2.0 * h.y)) +
    tap(uv + vec2f(0.0, 2.0 * h.y)) +
    (tap(uv + vec2f(-h.x, h.y)) +
      tap(uv + vec2f(h.x, h.y)) +
      tap(uv + vec2f(h.x, -h.y)) +
      tap(uv + vec2f(-h.x, -h.y))) * 2.0;
  return vec4f(color / 12.0, 1.0);
}
