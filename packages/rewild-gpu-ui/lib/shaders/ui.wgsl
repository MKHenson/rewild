// The base of every UI pipeline. Each pipeline adds one `effect` function,
// which colours the inside of a box:
//
//   fn effect(prim: Primitive, local: vec2f, inner: f32) -> vec4f
//
// `local` is the pixel's position in the box, in CSS pixels. `inner` is the
// coverage inside the border. It returns a premultiplied colour. The base
// applies the box's edge, its clip and its opacity.
//
// Glyph primitives skip the effect. The base draws them from the font atlas.

struct Uniforms {
  // The surface size in CSS pixels.
  viewport: vec2f,
  pixelRatio: f32,
  // Seconds, for effects that animate.
  time: f32,
};

// Matches PrimitiveStream in stream.ts. Rects are x, y, width, height in CSS
// pixels. Radii are top left, top right, bottom right, bottom left.
struct Primitive {
  rect: vec4f,
  clip: vec4f,
  clipRadii: vec4f,
  radii: vec4f,
  // The colour of a glyph.
  fill: vec4f,
  border: vec4f,
  // x: border width, y: opacity, z: kind, w: a glyph's distance range.
  params: vec4f,
  // Free for the effect. A glyph's cell in the atlas, in texels: left, top,
  // right, bottom, on texel centres.
  effect: vec4f,
};

// Matches PrimitiveKind in stream.ts.
const KIND_GLYPH = 1.0;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> primitives: array<Primitive>;
@group(0) @binding(2) var fontAtlas: texture_2d<f32>;
@group(0) @binding(3) var fontSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) index: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) index: u32) -> VertexOut {
  let rect = primitives[index].rect;
  let corner = vec2f(f32(vertexIndex & 1u), f32(vertexIndex >> 1u));
  // One device pixel round the box for the anti-aliased edge.
  let pad = 1.0 / u.pixelRatio;
  let p = rect.xy - pad + corner * (rect.zw + 2.0 * pad);
  var output: VertexOut;
  output.position = vec4f(p / u.viewport * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  output.index = index;
  return output;
}

// Signed distance to a box with a radius per corner.
fn roundRectDistance(p: vec2f, rect: vec4f, radii: vec4f) -> f32 {
  let halfSize = rect.zw * 0.5;
  let q0 = p - (rect.xy + halfSize);
  let side = select(radii.xw, radii.yz, q0.x > 0.0);
  let r = select(side.x, side.y, q0.y > 0.0);
  let q = abs(q0) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - r;
}

fn coverage(d: f32) -> f32 {
  return clamp(0.5 - d * u.pixelRatio, 0.0, 1.0);
}

fn premultiply(color: vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}

// Lays the border over a premultiplied fill. The fill runs under the border,
// as in CSS.
fn withBorder(fill: vec4f, prim: Primitive, inner: f32) -> vec4f {
  let border = premultiply(prim.border);
  let ring = border + fill * (1.0 - border.a);
  return mix(ring, fill, inner);
}

// The coverage of an MTSDF glyph at `p`, from the median of its colour
// channels. Alpha holds the true distance, for later effects such as
// outlines. The glyph's quad maps its cell with no rotation, so the quad's
// size gives the device pixels per texel, with no derivatives.
fn glyphCoverage(prim: Primitive, p: vec2f) -> f32 {
  let cell = prim.effect;
  let t = (p - prim.rect.xy) / prim.rect.zw;
  // The quad has a device pixel of padding. Clamp so it does not read the
  // next cell. The cell's edges are on texel centres.
  let texel = clamp(mix(cell.xy, cell.zw, t), cell.xy, cell.zw);
  let uv = texel / vec2f(textureDimensions(fontAtlas));
  let s = textureSampleLevel(fontAtlas, fontSampler, uv, 0.0).rgb;
  let distance = max(min(s.r, s.g), min(max(s.r, s.g), s.b)) - 0.5;
  let pixelsPerTexel = prim.rect.z * u.pixelRatio / (cell.z - cell.x);
  // At least 1, so small text stays smooth.
  let range = max(prim.params.w * pixelsPerTexel, 1.0);
  return clamp(distance * range + 0.5, 0.0, 1.0);
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let prim = primitives[input.index];
  let p = input.position.xy / u.pixelRatio;
  let borderWidth = prim.params.x;
  let clip = coverage(roundRectDistance(p, prim.clip, prim.clipRadii));

  if (prim.params.z == KIND_GLYPH) {
    return premultiply(prim.fill) * glyphCoverage(prim, p) * clip * prim.params.y;
  }

  let outer = coverage(roundRectDistance(p, prim.rect, prim.radii));
  let innerRect = vec4f(prim.rect.xy + borderWidth, max(prim.rect.zw - 2.0 * borderWidth, vec2f(0.0)));
  let innerRadii = max(prim.radii - borderWidth, vec4f(0.0));
  let inner = select(1.0, coverage(roundRectDistance(p, innerRect, innerRadii)), borderWidth > 0.0);

  return effect(prim, p - prim.rect.xy, inner) * outer * clip * prim.params.y;
}
