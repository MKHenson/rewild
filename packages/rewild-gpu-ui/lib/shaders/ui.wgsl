// The base of every UI pipeline. Each pipeline adds one `effect` function,
// which colours a box:
//
//   fn effect(prim: Primitive, px: Pixel) -> vec4f
//
// It returns a premultiplied colour. The base applies the clip and the
// opacity. It also cuts the box's rounded edge, unless the node has an outset:
// then the quad grows by the outset, and the effect can draw outside the box,
// such as a glow, and covers what it draws itself from `px.edge`.
//
// Glyph, icon and shadow primitives skip the effect. The base draws glyphs
// and icons from the font atlas and the icon atlas, and shadows from the box.
// A glass box lays its effect over the blurred backdrop.
//
// A world surface draws on a quad in the scene. From behind, it shows only its
// glass boxes, as plain glass with no effect.

struct Uniforms {
  // The surface size in CSS pixels.
  viewport: vec2f,
  // Device pixels per CSS pixel. A world surface works its own out per pixel.
  pixelRatio: f32,
  // Seconds, for effects that animate.
  time: f32,
  // The target size in device pixels.
  targetSize: vec2f,
  // 1 for a world surface, else 0.
  world: f32,
  // Maps the surface's CSS pixels to clip space.
  clip: mat4x4f,
};

// Matches PrimitiveStream in stream.ts. Rects are x, y, width, height in CSS
// pixels. Radii are top left, top right, bottom right, bottom left.
struct Primitive {
  rect: vec4f,
  clip: vec4f,
  clipRadii: vec4f,
  radii: vec4f,
  // The colour of a glyph, an icon or a shadow.
  fill: vec4f,
  // A shadow's radii: of its box, or of the hole of an inset shadow.
  border: vec4f,
  // x: border width, y: opacity, z: kind, w: a glyph's or an icon's distance
  // range in the atlas, or else the CSS pixels the quad grows by.
  params: vec4f,
  // Free for the effect. A glyph's or an icon's cell in its atlas, in texels:
  // left, top, right, bottom, on texel centres. A shadow's x and y offset, its
  // deviation and its spread.
  effect: vec4f,
};

// What the base gives an effect about a pixel.
struct Pixel {
  // The position in the box, in CSS pixels. It is outside the box in the outset.
  local: vec2f,
  // The signed distance to the box's rounded edge, in CSS pixels. Negative inside.
  edge: f32,
  // The coverage of the box, with its anti-aliased edge.
  outer: f32,
  // The coverage inside the border.
  inner: f32,
};

// Matches PrimitiveKind in stream.ts.
const KIND_GLYPH = 1.0;
const KIND_ICON = 2.0;
const KIND_GLASS = 3.0;
const KIND_SHADOW = 4.0;
const KIND_INSET_SHADOW = 5.0;

// The DOM glass's `saturate(150%)`.
const GLASS_SATURATION = 1.5;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> primitives: array<Primitive>;
@group(0) @binding(2) var fontAtlas: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;
@group(0) @binding(4) var iconAtlas: texture_2d<f32>;
// The blurred image under the UI, the size of the surface. Transparent when
// there is none.
@group(0) @binding(5) var backdrop: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) index: u32,
  // The position on the surface, in CSS pixels.
  @location(1) local: vec2f,
};

// Device pixels per CSS pixel at this fragment. Set at the start of `fs`.
var<private> scale: f32;

fn isAtlas(kind: f32) -> bool {
  return kind == KIND_GLYPH || kind == KIND_ICON;
}

// The surface point `p` in device pixels on the target.
fn toTarget(p: vec2f) -> vec2f {
  let clip = u.clip * vec4f(p, 0.0, 1.0);
  return clip.xy / max(clip.w, 1e-4) * u.targetSize * 0.5;
}

// CSS pixels on a world surface per device pixel near `p`. The surface is in
// perspective, so it differs from corner to corner.
fn worldPixelSize(p: vec2f) -> f32 {
  let origin = toTarget(p);
  let across = length(toTarget(p + vec2f(1.0, 0.0)) - origin);
  let down = length(toTarget(p + vec2f(0.0, 1.0)) - origin);
  // At most 16, so a surface seen edge on does not grow without end.
  return 1.0 / max(min(across, down), 1.0 / 16.0);
}

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) index: u32) -> VertexOut {
  let prim = primitives[index];
  let rect = prim.rect;
  let corner = vec2f(f32(vertexIndex & 1u), f32(vertexIndex >> 1u));
  // One device pixel round the box for the anti-aliased edge, and the outset.
  let outset = select(prim.params.w, 0.0, isAtlas(prim.params.z));
  var pixel = 1.0 / u.pixelRatio;
  if (u.world > 0.0) {
    pixel = worldPixelSize(rect.xy + corner * rect.zw);
  }
  let pad = pixel + outset;
  let p = rect.xy - pad + corner * (rect.zw + 2.0 * pad);
  var output: VertexOut;
  output.position = u.clip * vec4f(p, 0.0, 1.0);
  output.index = index;
  output.local = p;
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
  return clamp(0.5 - d * scale, 0.0, 1.0);
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

// The coverage of a glyph or an icon at `p`, from the median of the atlas's
// colour channels. The font atlas is an MTSDF, and its alpha holds the true
// distance, for later effects such as outlines. The icon atlas is a grey SDF,
// so its three channels are equal. The quad maps its cell with no rotation,
// so the quad's size gives the device pixels per texel, with no derivatives.
fn atlasCoverage(atlas: texture_2d<f32>, prim: Primitive, p: vec2f) -> f32 {
  let cell = prim.effect;
  let t = (p - prim.rect.xy) / prim.rect.zw;
  // The quad has a device pixel of padding. Clamp so it does not read the
  // next cell. The cell's edges are on texel centres.
  let texel = clamp(mix(cell.xy, cell.zw, t), cell.xy, cell.zw);
  let uv = texel / vec2f(textureDimensions(atlas));
  let s = textureSampleLevel(atlas, atlasSampler, uv, 0.0).rgb;
  let distance = max(min(s.r, s.g), min(max(s.r, s.g), s.b)) - 0.5;
  let pixelsPerTexel = prim.rect.z * scale / (cell.z - cell.x);
  // At least 1, so small text stays smooth.
  let range = max(prim.params.w * pixelsPerTexel, 1.0);
  return clamp(distance * range + 0.5, 0.0, 1.0);
}

// The blurred backdrop at `uv` on the target, premultiplied, with the
// saturation raised by the CSS `saturate()` matrix.
fn glassBackdrop(uv: vec2f) -> vec4f {
  let color = textureSampleLevel(backdrop, atlasSampler, uv, 0.0);
  let s = GLASS_SATURATION;
  let matrix = mat3x3f(
    vec3f(0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s),
    vec3f(0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s),
    vec3f(0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s),
  );
  return vec4f(clamp(matrix * color.rgb, vec3f(0.0), vec3f(color.a)), color.a);
}

// The white light that follows the pointer over a glass box, as on the DOM
// modal. A sheen lies over the fill, and the rim brightens the border.
// `effect.xy` is the light's place as a fraction of the box, and `effect.z`
// its strength. A strength of 0 draws no light. `color` is premultiplied.
fn glassLight(prim: Primitive, px: Pixel, color: vec4f) -> vec4f {
  let strength = prim.effect.z;
  if (strength <= 0.0) {
    return color;
  }
  let d = distance(px.local, prim.effect.xy * prim.rect.zw);
  // The DOM's 500 px gradient from 9 % white, gone at 60 %.
  let sheen = 0.09 * strength * clamp(1.0 - d / 300.0, 0.0, 1.0);
  // The DOM's 240 px gradient from 95 % white, gone at 70 %.
  let rim = 0.95 * strength * clamp(1.0 - d / 168.0, 0.0, 1.0) * (1.0 - px.inner);
  let lit = vec4f(sheen) + color * (1.0 - sheen);
  return vec4f(rim) + lit * (1.0 - rim);
}

fn gaussian(x: f32, sigma: f32) -> f32 {
  return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma);
}

// An approximation of erf, good to 5e-4.
fn erf2(x: vec2f) -> vec2f {
  let s = sign(x);
  let a = abs(x);
  var y = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  y = y * y;
  return s - s / (y * y);
}

// One row of a blurred rounded box: the integral along x, exact for the box.
fn blurredRow(x: f32, y: f32, sigma: f32, corner: f32, halfSize: vec2f) -> f32 {
  let delta = min(halfSize.y - corner - abs(y), 0.0);
  let curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  let integral = 0.5 + 0.5 * erf2((x + vec2f(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}

// The coverage of a box with round corners, blurred by a Gaussian with
// deviation `sigma`. It sums four rows along y. After Evan Wallace, "Fast
// rounded rectangle shadows". Each quarter of the box uses its own corner.
fn blurredBox(p: vec2f, rect: vec4f, radii: vec4f, sigma: f32) -> f32 {
  if (sigma * scale < 0.25) {
    return coverage(roundRectDistance(p, rect, radii));
  }
  let halfSize = rect.zw * 0.5;
  let q = p - (rect.xy + halfSize);
  let side = select(radii.xw, radii.yz, q.x > 0.0);
  let corner = min(select(side.x, side.y, q.y > 0.0), min(halfSize.x, halfSize.y));
  let low = q.y - halfSize.y;
  let high = q.y + halfSize.y;
  let start = clamp(-3.0 * sigma, low, high);
  let end = clamp(3.0 * sigma, low, high);
  let dy = (end - start) / 4.0;
  var y = start + dy * 0.5;
  var value = 0.0;
  for (var i = 0; i < 4; i++) {
    value += blurredRow(q.x, q.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * dy;
    y += dy;
  }
  return value;
}

// An outer shadow: the box moved and grown by the spread, then blurred. It
// draws only outside the box, as CSS clips it.
fn outerShadow(prim: Primitive, p: vec2f) -> vec4f {
  let offset = prim.effect.xy;
  let spread = prim.effect.w;
  let shape = vec4f(prim.rect.xy + offset - spread, max(prim.rect.zw + 2.0 * spread, vec2f(0.0)));
  let shadow = blurredBox(p, shape, prim.border, prim.effect.z);
  let outside = 1.0 - coverage(roundRectDistance(p, prim.rect, prim.radii));
  return premultiply(prim.fill) * shadow * outside;
}

// An inset shadow: everything in the padding box but a hole, the padding box
// moved and shrunk by the spread, then blurred.
fn insetShadow(prim: Primitive, p: vec2f) -> vec4f {
  let borderWidth = prim.params.x;
  let padding = vec4f(prim.rect.xy + borderWidth, max(prim.rect.zw - 2.0 * borderWidth, vec2f(0.0)));
  let paddingRadii = max(prim.radii - borderWidth, vec4f(0.0));
  let offset = prim.effect.xy;
  let spread = prim.effect.w;
  let hole = vec4f(padding.xy + offset + spread, max(padding.zw - 2.0 * spread, vec2f(0.0)));
  let shadow = 1.0 - blurredBox(p, hole, prim.border, prim.effect.z);
  return premultiply(prim.fill) * shadow * coverage(roundRectDistance(p, padding, paddingRadii));
}

@fragment
fn fs(input: VertexOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let world = u.world > 0.0;
  // The derivatives run before any branch, as WGSL needs.
  let dx = dpdx(input.local);
  let dy = dpdy(input.local);
  let worldScale = inverseSqrt(max(abs(dx.x * dy.y - dx.y * dy.x), 1e-12));
  scale = select(u.pixelRatio, worldScale, world);
  let p = select(input.position.xy / u.pixelRatio, input.local, world);
  let uv = input.position.xy / u.targetSize;

  let prim = primitives[input.index];
  let kind = prim.params.z;
  let back = world && !front;
  if (back && kind != KIND_GLASS) {
    return vec4f(0.0);
  }
  let alpha = coverage(roundRectDistance(p, prim.clip, prim.clipRadii)) * prim.params.y;

  if (kind == KIND_GLYPH) {
    return premultiply(prim.fill) * atlasCoverage(fontAtlas, prim, p) * alpha;
  }
  if (kind == KIND_ICON) {
    return premultiply(prim.fill) * atlasCoverage(iconAtlas, prim, p) * alpha;
  }
  if (kind == KIND_SHADOW) {
    return outerShadow(prim, p) * alpha;
  }
  if (kind == KIND_INSET_SHADOW) {
    return insetShadow(prim, p) * alpha;
  }

  let borderWidth = prim.params.x;
  let edge = roundRectDistance(p, prim.rect, prim.radii);
  let outer = coverage(edge);
  let innerRect = vec4f(prim.rect.xy + borderWidth, max(prim.rect.zw - 2.0 * borderWidth, vec2f(0.0)));
  let innerRadii = max(prim.radii - borderWidth, vec4f(0.0));
  let inner = select(1.0, coverage(roundRectDistance(p, innerRect, innerRadii)), borderWidth > 0.0);

  var color: vec4f;
  if (back) {
    color = withBorder(premultiply(prim.fill), prim, inner);
  } else {
    color = effect(prim, Pixel(p - prim.rect.xy, edge, outer, inner));
  }
  // The backdrop fills the box under the effect, as CSS's backdrop-filter
  // fills the border box under the background.
  var under = vec4f(0.0);
  if (kind == KIND_GLASS) {
    under = glassBackdrop(uv) * outer * (1.0 - color.a);
  }
  if (prim.params.w == 0.0 || back) {
    color *= outer;
  }
  return (color + under) * alpha;
}
