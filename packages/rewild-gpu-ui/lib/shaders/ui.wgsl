struct Uniforms {
  // The surface size in CSS pixels.
  viewport: vec2f,
  pixelRatio: f32,
  _pad: f32,
};

// Matches PrimitiveStream in stream.ts. Rects are x, y, width, height in CSS
// pixels. Radii are top left, top right, bottom right, bottom left.
struct Primitive {
  rect: vec4f,
  clip: vec4f,
  clipRadii: vec4f,
  radii: vec4f,
  fill: vec4f,
  border: vec4f,
  // x: border width, y: opacity.
  params: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> primitives: array<Primitive>;

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

@fragment
fn fs(input: VertexOut) -> @location(0) vec4f {
  let prim = primitives[input.index];
  let p = input.position.xy / u.pixelRatio;
  let borderWidth = prim.params.x;

  let outer = coverage(roundRectDistance(p, prim.rect, prim.radii));
  let innerRect = vec4f(prim.rect.xy + borderWidth, max(prim.rect.zw - 2.0 * borderWidth, vec2f(0.0)));
  let innerRadii = max(prim.radii - borderWidth, vec4f(0.0));
  let inner = select(1.0, coverage(roundRectDistance(p, innerRect, innerRadii)), borderWidth > 0.0);
  let clip = coverage(roundRectDistance(p, prim.clip, prim.clipRadii));

  // The background fills the whole box, under the border, as in CSS.
  let fill = vec4f(prim.fill.rgb * prim.fill.a, prim.fill.a);
  let border = vec4f(prim.border.rgb * prim.border.a, prim.border.a);
  let ring = border + fill * (1.0 - border.a);
  return mix(ring, fill, inner) * outer * clip * prim.params.y;
}
