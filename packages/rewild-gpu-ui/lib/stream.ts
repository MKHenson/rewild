import { parseColor, RGBA } from './color';
import type { Bounds, UIFont } from './font';
import type { UIIcons } from './icons';
import { innerBox } from './layout';
import { cornerRadii, Sides } from './style';
import { placeText, resolveTextStyle } from './text';
import { Rect, UINode } from './UINode';

/**
 * Floats per primitive: rect, clip rect, clip radii, corner radii, fill,
 * border colour, params (border width, opacity, kind, distance range) and
 * effect params. Matches `Primitive` in ui.wgsl.
 */
export const PRIMITIVE_FLOATS = 32;

/** The kind in a primitive's params. Matches the constants in ui.wgsl. */
export enum PrimitiveKind {
  Rect = 0,
  Glyph = 1,
  Icon = 2,
}

/** Where the effect params start in a primitive. */
const EFFECT_OFFSET = 28;

type Radii = [number, number, number, number];
export type EffectParams = [number, number, number, number];

const NO_CLIP: Rect = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };
const NO_RADII: Radii = [0, 0, 0, 0];
const NONE = [0, 0, 0, 0];

export interface RectPrimitive {
  rect: Rect;
  clip?: Rect;
  clipRadii?: Radii;
  radii?: Radii;
  fill?: number[];
  border?: number[];
  borderWidth?: number;
  opacity?: number;
  /** The registered effect that draws the rect, or null for a plain rect. */
  effect?: string | null;
  effectParams?: EffectParams;
  /** The node the rect draws, so its effect params can change in place. */
  node?: UINode;
}

/**
 * One quad from a distance field atlas: a glyph from the font or an icon. It
 * draws with the plain rect pipeline.
 */
export interface AtlasPrimitive {
  kind: PrimitiveKind.Glyph | PrimitiveKind.Icon;
  rect: Rect;
  clip: Rect;
  clipRadii: Radii;
  color: RGBA;
  opacity: number;
  /** The quad's cell in the atlas, in texels. */
  atlas: Bounds;
  distanceRange: number;
}

/** The primitives of one surface, in draw order. */
export class PrimitiveStream {
  data = new Float32Array(64 * PRIMITIVE_FLOATS);
  count = 0;
  /** The effect of each primitive. */
  readonly effects: (string | null)[] = [];
  /** The node of each primitive, or null for an overlay primitive. */
  readonly nodes: (UINode | null)[] = [];
  /** The primitives changed since the last upload, from `dirtyFrom` up to but not including `dirtyTo`. */
  dirtyFrom = 0;
  dirtyTo = 0;

  reset(): void {
    this.count = 0;
    this.dirtyFrom = 0;
    this.dirtyTo = 0;
  }

  pushRect(p: RectPrimitive): void {
    this.reserve(this.count + 1);
    const d = this.data;
    const { rect, clip = NO_CLIP } = p;
    let o = this.count * PRIMITIVE_FLOATS;
    o = write4(d, o, rect.x, rect.y, rect.width, rect.height);
    o = write4(d, o, clip.x, clip.y, clip.width, clip.height);
    d.set(p.clipRadii ?? NO_RADII, o);
    d.set(p.radii ?? NO_RADII, o + 4);
    d.set(p.fill ?? NONE, o + 8);
    d.set(p.border ?? NONE, o + 12);
    write4(d, o + 16, p.borderWidth ?? 0, p.opacity ?? 1, 0, 0);
    d.set(p.effectParams ?? NONE, o + 20);
    this.effects[this.count] = p.effect ?? null;
    this.nodes[this.count] = p.node ?? null;
    if (p.node) p.node.primitive = this.count;
    this.count++;
    this.dirtyTo = this.count;
  }

  pushAtlas(p: AtlasPrimitive): void {
    this.reserve(this.count + 1);
    const d = this.data;
    const { rect, clip, atlas } = p;
    let o = this.count * PRIMITIVE_FLOATS;
    o = write4(d, o, rect.x, rect.y, rect.width, rect.height);
    o = write4(d, o, clip.x, clip.y, clip.width, clip.height);
    d.set(p.clipRadii, o);
    d.set(NO_RADII, o + 4);
    d.set(p.color, o + 8);
    d.set(NONE, o + 12);
    write4(d, o + 16, 0, p.opacity, p.kind, p.distanceRange);
    write4(d, o + 20, atlas.left, atlas.top, atlas.right, atlas.bottom);
    this.effects[this.count] = null;
    this.nodes[this.count] = null;
    this.count++;
    this.dirtyTo = this.count;
  }

  /**
   * Writes a node's effect params in place. Returns false when the node has
   * no primitive in the stream.
   */
  setEffectParams(node: UINode, params: EffectParams): boolean {
    const index = node.primitive;
    if (index < 0 || index >= this.count || this.nodes[index] !== node)
      return false;
    this.data.set(params, index * PRIMITIVE_FLOATS + EFFECT_OFFSET);
    if (this.dirtyFrom >= this.dirtyTo) {
      this.dirtyFrom = index;
      this.dirtyTo = index + 1;
    } else {
      this.dirtyFrom = Math.min(this.dirtyFrom, index);
      this.dirtyTo = Math.max(this.dirtyTo, index + 1);
    }
    return true;
  }

  /** Marks every primitive as uploaded. */
  clearDirty(): void {
    this.dirtyFrom = 0;
    this.dirtyTo = 0;
  }

  private reserve(count: number): void {
    if (count * PRIMITIVE_FLOATS <= this.data.length) return;
    const data = new Float32Array(this.data.length * 2);
    data.set(this.data);
    this.data = data;
  }
}

function write4(
  d: Float32Array,
  o: number,
  a: number,
  b: number,
  c: number,
  e: number
): number {
  d[o] = a;
  d[o + 1] = b;
  d[o + 2] = c;
  d[o + 3] = e;
  return o + 4;
}

export interface WriteOptions {
  /** Draws the layout overlay on top. */
  overlay?: boolean;
  /** Text draws only when there is a font. */
  font?: UIFont | null;
  /** Icons draw only when there are icons. */
  icons?: UIIcons | null;
  /** Device pixels per CSS pixel, which text baselines snap to. */
  pixelRatio?: number;
  /** The node that draws the focus ring, or null. */
  focus?: UINode | null;
}

/**
 * Writes the tree's primitives in tree order: a node's box, then its icon,
 * then its text, then its children. Layout must have run.
 */
export function writeTree(
  root: UINode,
  stream: PrimitiveStream,
  options: WriteOptions = {}
): void {
  stream.reset();
  writeNode(root, stream, options, NO_CLIP, NO_RADII, 1);
  if (options.overlay)
    for (const child of root.children) writeOverlay(child, stream);
}

function writeNode(
  node: UINode,
  stream: PrimitiveStream,
  options: WriteOptions,
  clip: Rect,
  clipRadii: Radii,
  parentOpacity: number
): void {
  const { style, rect } = node;
  if (style.display === 'none') return;
  // Opacity multiplies down the tree, so overlapping children of a faded
  // node fade one by one, not as a group as in CSS.
  const opacity = parentOpacity * (style.opacity ?? 1);
  if (opacity <= 0) return;

  const radii = fitRadii(cornerRadii(style.borderRadius), rect);
  const borderWidth = style.borderWidth ?? 0;
  const fill = parseColor(style.backgroundColor);
  const border = parseColor(style.borderColor);
  // An effect draws its own content, so it draws with no fill or border.
  if (node.effect || fill[3] > 0 || (borderWidth > 0 && border[3] > 0))
    stream.pushRect({
      rect,
      clip,
      clipRadii,
      radii,
      fill,
      border,
      borderWidth,
      opacity,
      effect: node.effect,
      effectParams: node.effectParams,
      node,
    });

  const outerClip = clip;
  const outerRadii = clipRadii;
  if (style.overflow === 'hidden') {
    // Nested clips keep only the innermost corner radii.
    clip = intersect(clip, innerBox(node));
    clipRadii = radii.map((r) => Math.max(0, r - borderWidth)) as Radii;
  }
  if (node.icon && options.icons)
    writeIcon(node, stream, options, options.icons, clip, clipRadii, opacity);
  if (node.text && options.font)
    writeText(node, stream, options, options.font, clip, clipRadii, opacity);
  for (const child of node.children)
    writeNode(child, stream, options, clip, clipRadii, opacity);
  // The ring draws over the node's children, and its parent's clip cuts it,
  // as with a CSS outline.
  if (node === options.focus)
    writeFocusRing(stream, rect, radii, outerClip, outerRadii, opacity);
}

/**
 * The DOM's focus ring: `outline: 2px solid` in the primary colour, with no
 * offset. A rounded box gets a ring with its radii plus the width, as Chrome
 * draws it.
 */
const FOCUS_RING_WIDTH = 2;
// The dark theme's `--primary-400`, until Mica reads the theme.
const FOCUS_RING_COLOR = parseColor('#3a86cf');

function writeFocusRing(
  stream: PrimitiveStream,
  rect: Rect,
  radii: Radii,
  clip: Rect,
  clipRadii: Radii,
  opacity: number
): void {
  const w = FOCUS_RING_WIDTH;
  stream.pushRect({
    rect: {
      x: rect.x - w,
      y: rect.y - w,
      width: rect.width + 2 * w,
      height: rect.height + 2 * w,
    },
    clip,
    clipRadii,
    radii: radii.map((r) => (r > 0 ? r + w : 0)) as Radii,
    border: FOCUS_RING_COLOR,
    borderWidth: w,
    opacity,
  });
}

function writeText(
  node: UINode,
  stream: PrimitiveStream,
  options: WriteOptions,
  font: UIFont,
  clip: Rect,
  clipRadii: Radii,
  opacity: number
): void {
  const style = resolveTextStyle(node);
  const color = parseColor(style.color);
  if (color[3] <= 0) return;
  const box = contentBox(node);
  const glyphs = placeText(node, font, style, box, options.pixelRatio ?? 1);
  for (const { rect, atlas } of glyphs)
    stream.pushAtlas({
      kind: PrimitiveKind.Glyph,
      rect,
      clip,
      clipRadii,
      color,
      opacity,
      atlas,
      distanceRange: font.distanceRange,
    });
}

/**
 * Draws the node's icon as the largest square that fits its content box,
 * centred, in the text colour. The square's top left snaps to device pixels,
 * so lucide's strokes on whole grid units stay sharp.
 */
function writeIcon(
  node: UINode,
  stream: PrimitiveStream,
  options: WriteOptions,
  icons: UIIcons,
  clip: Rect,
  clipRadii: Radii,
  opacity: number
): void {
  const icon = icons.icon(node.icon!);
  if (!icon) return;
  const color = parseColor(resolveTextStyle(node).color);
  if (color[3] <= 0) return;
  const box = contentBox(node);
  const size = Math.min(box.width, box.height);
  if (size <= 0) return;
  const ratio = options.pixelRatio ?? 1;
  const snap = (v: number) => Math.round(v * ratio) / ratio;
  const x = snap(box.x + (box.width - size) / 2);
  const y = snap(box.y + (box.height - size) / 2);
  const { planeBounds: plane, atlasBounds: atlas } = icon;
  stream.pushAtlas({
    kind: PrimitiveKind.Icon,
    rect: {
      x: x + plane.left * size,
      y: y + plane.top * size,
      width: (plane.right - plane.left) * size,
      height: (plane.bottom - plane.top) * size,
    },
    clip,
    clipRadii,
    color,
    opacity,
    atlas,
    distanceRange: icons.distanceRange,
  });
}

/** The box inside the border and padding. */
function contentBox(node: UINode): Rect {
  const inside = innerBox(node);
  const [top, right, bottom, left] = node.padding;
  return {
    x: inside.x + left,
    y: inside.y + top,
    width: Math.max(0, inside.width - left - right),
    height: Math.max(0, inside.height - top - bottom),
  };
}

/** Scales the radii down when adjacent corners overlap, as CSS does. */
export function fitRadii(radii: Radii, rect: Rect): Radii {
  const [tl, tr, br, bl] = radii;
  const scale = Math.min(
    1,
    ratio(rect.width, tl + tr),
    ratio(rect.width, bl + br),
    ratio(rect.height, tl + bl),
    ratio(rect.height, tr + br)
  );
  return scale < 1 ? [tl * scale, tr * scale, br * scale, bl * scale] : radii;
}

function ratio(side: number, sum: number): number {
  return sum > 0 ? side / sum : 1;
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

// Overlay colours follow the browser's layout overlay.
const MARGIN_COLOR = [0.96, 0.7, 0.42, 0.4];
const PADDING_COLOR = [0.58, 0.77, 0.49, 0.4];
const BOX_COLOR = [0.44, 0.66, 0.86, 1];
const CLIP_COLOR = [0.86, 0.3, 0.86, 1];

/** Margins, padding, border boxes and clip rects, like the browser's layout overlay. */
function writeOverlay(node: UINode, stream: PrimitiveStream): void {
  if (node.style.display === 'none') return;
  const { rect, margin } = node;
  const marginBox = {
    x: rect.x - margin[3],
    y: rect.y - margin[0],
    width: rect.width + margin[1] + margin[3],
    height: rect.height + margin[0] + margin[2],
  };
  writeStrips(stream, marginBox, margin, MARGIN_COLOR);
  const inside = innerBox(node);
  writeStrips(stream, inside, node.padding, PADDING_COLOR);
  stream.pushRect({ rect, border: BOX_COLOR, borderWidth: 1 });
  if (node.style.overflow === 'hidden')
    stream.pushRect({ rect: inside, border: CLIP_COLOR, borderWidth: 1 });
  for (const child of node.children) writeOverlay(child, stream);
}

/** Fills the band inside `outer` that `sides` wide edges make. */
function writeStrips(
  stream: PrimitiveStream,
  outer: Rect,
  sides: Sides,
  color: number[]
): void {
  const [top, right, bottom, left] = sides.map((s) => Math.max(0, s));
  const middle = outer.height - top - bottom;
  const strips: Rect[] = [
    { x: outer.x, y: outer.y, width: outer.width, height: top },
    {
      x: outer.x,
      y: outer.y + outer.height - bottom,
      width: outer.width,
      height: bottom,
    },
    { x: outer.x, y: outer.y + top, width: left, height: middle },
    {
      x: outer.x + outer.width - right,
      y: outer.y + top,
      width: right,
      height: middle,
    },
  ];
  for (const strip of strips)
    if (strip.width > 0 && strip.height > 0)
      stream.pushRect({ rect: strip, fill: color });
}
