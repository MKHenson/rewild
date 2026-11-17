import { parseColor } from './color';
import { innerBox } from './layout';
import { cornerRadii, Sides } from './style';
import { Rect, UINode } from './UINode';

/**
 * Floats per primitive: rect, clip rect, clip radii, corner radii, fill,
 * border colour, and params (border width, opacity). Matches `Primitive` in
 * ui.wgsl.
 */
export const PRIMITIVE_FLOATS = 28;

type Radii = [number, number, number, number];

const NO_CLIP: Rect = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };
const NO_RADII: Radii = [0, 0, 0, 0];

/** The primitives of one surface, in draw order. */
export class PrimitiveStream {
  data = new Float32Array(64 * PRIMITIVE_FLOATS);
  count = 0;

  reset(): void {
    this.count = 0;
  }

  pushRect(
    rect: Rect,
    clip: Rect,
    clipRadii: Radii,
    radii: Radii,
    fill: number[],
    border: number[],
    borderWidth: number,
    opacity: number
  ): void {
    this.reserve(this.count + 1);
    const d = this.data;
    let o = this.count * PRIMITIVE_FLOATS;
    o = write4(d, o, rect.x, rect.y, rect.width, rect.height);
    o = write4(d, o, clip.x, clip.y, clip.width, clip.height);
    d.set(clipRadii, o);
    d.set(radii, o + 4);
    d.set(fill, o + 8);
    d.set(border, o + 12);
    write4(d, o + 16, borderWidth, opacity, 0, 0);
    this.count++;
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

/**
 * Writes the tree's primitives in tree order. Layout must have run. With
 * `overlay`, the layout overlay draws on top.
 */
export function writeTree(
  root: UINode,
  stream: PrimitiveStream,
  overlay = false
): void {
  stream.reset();
  writeNode(root, stream, NO_CLIP, NO_RADII, 1);
  if (overlay) for (const child of root.children) writeOverlay(child, stream);
}

function writeNode(
  node: UINode,
  stream: PrimitiveStream,
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
  if (fill[3] > 0 || (borderWidth > 0 && border[3] > 0))
    stream.pushRect(
      rect,
      clip,
      clipRadii,
      radii,
      fill,
      border,
      borderWidth,
      opacity
    );

  if (style.overflow === 'hidden') {
    // Nested clips keep only the innermost corner radii.
    clip = intersect(clip, innerBox(node));
    clipRadii = radii.map((r) => Math.max(0, r - borderWidth)) as Radii;
  }
  for (const child of node.children)
    writeNode(child, stream, clip, clipRadii, opacity);
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

function intersect(a: Rect, b: Rect): Rect {
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
const NONE = [0, 0, 0, 0];

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
  stream.pushRect(rect, NO_CLIP, NO_RADII, NO_RADII, NONE, BOX_COLOR, 1, 1);
  if (node.style.overflow === 'hidden')
    stream.pushRect(
      inside,
      NO_CLIP,
      NO_RADII,
      NO_RADII,
      NONE,
      CLIP_COLOR,
      1,
      1
    );
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
      stream.pushRect(strip, NO_CLIP, NO_RADII, NO_RADII, color, NONE, 0, 1);
}
