import { RGBA, resolveColor } from './color';
import type { Bounds, UIFont } from './font';
import type { UIIcons } from './icons';
import { innerBox } from './layout';
import {
  cornerRadii,
  Sides,
  UIBoxShadow,
  UIColor,
  UITransitionProperty,
} from './style';
import { placeText, resolveTextStyle } from './text';
import type { UITheme } from './theme';
import {
  IDENTITY,
  Placement,
  placeNode,
  placeRect,
  transformValue,
} from './transform';
import { findTransition, NodeTransitions, TransitionValue } from './transition';
import { Rect, UINode } from './UINode';

/**
 * Floats per primitive: rect, clip rect, clip radii, corner radii, fill,
 * border colour, params (border width, opacity, kind, distance range or
 * outset) and effect params. Matches `Primitive` in ui.wgsl.
 */
export const PRIMITIVE_FLOATS = 32;

/** The kind in a primitive's params. Matches the constants in ui.wgsl. */
export enum PrimitiveKind {
  Rect = 0,
  Glyph = 1,
  Icon = 2,
  /** A box over the blurred backdrop. */
  Glass = 3,
  /** An outer box shadow. Its border colour holds the shadow's radii. */
  Shadow = 4,
  /** An inset box shadow. Its border colour holds the radii of the hole. */
  InsetShadow = 5,
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
  /** Defaults to `Rect`. Not a glyph or an icon. */
  kind?: PrimitiveKind;
  /** CSS pixels the quad grows by on each side. */
  outset?: number;
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
  /** The glass primitives, which need the blurred backdrop. */
  glass = 0;
  /** The effect of each primitive. */
  readonly effects: (string | null)[] = [];
  /** The node of each primitive, or null for an overlay primitive. */
  readonly nodes: (UINode | null)[] = [];
  /** The primitives changed since the last upload, from `dirtyFrom` up to but not including `dirtyTo`. */
  dirtyFrom = 0;
  dirtyTo = 0;

  reset(): void {
    this.count = 0;
    this.glass = 0;
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
    const kind = p.kind ?? PrimitiveKind.Rect;
    write4(d, o + 16, p.borderWidth ?? 0, p.opacity ?? 1, kind, p.outset ?? 0);
    d.set(p.effectParams ?? NONE, o + 20);
    if (kind === PrimitiveKind.Glass) this.glass++;
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
  /** Resolves theme colours. With no theme, they are transparent. */
  theme?: UITheme | null;
  /** The time in milliseconds, for transitions. */
  now?: number;
}

interface WriteContext extends WriteOptions {
  /** Set when a transition has not ended, so the tree must draw again. */
  animating: boolean;
}

/**
 * Writes the tree's primitives in tree order: a node's outer shadows, its
 * box, its inset shadows, then its icon, its text and its children. Layout
 * must have run. Returns true when a transition is running, so the tree
 * must be written again on the next frame.
 */
export function writeTree(
  root: UINode,
  stream: PrimitiveStream,
  options: WriteOptions = {}
): boolean {
  const context: WriteContext = { ...options, animating: false };
  stream.reset();
  writeNode(root, stream, context, NO_CLIP, NO_RADII, 1, IDENTITY);
  if (options.overlay)
    for (const child of root.children) writeOverlay(child, stream);
  return context.animating;
}

/**
 * The property's value to draw: its target, or a value on the way to it
 * when the style has a transition for it.
 */
function animated(
  node: UINode,
  key: UITransitionProperty,
  target: TransitionValue,
  context: WriteContext
): TransitionValue {
  if (!findTransition(node.style, key)) {
    node.transitions?.clear(key);
    return target;
  }
  node.transitions ??= new NodeTransitions();
  const { value, running } = node.transitions.value(
    key,
    target,
    context.now ?? 0
  );
  if (running) context.animating = true;
  return value;
}

function animatedColor(
  node: UINode,
  key: 'backgroundColor' | 'borderColor' | 'color',
  context: WriteContext
): RGBA {
  const target = resolveColor(node.style[key], context.theme);
  return animated(node, key, target, context) as RGBA;
}

/** The text colour that passes down to the node, part way through a transition. */
function textColor(node: UINode, context: WriteContext): RGBA {
  for (let n: UINode | null = node; n; n = n.parent)
    if (n.style.color !== undefined) return animatedColor(n, 'color', context);
  return WHITE;
}

const WHITE: RGBA = [1, 1, 1, 1];

function writeNode(
  node: UINode,
  stream: PrimitiveStream,
  context: WriteContext,
  clip: Rect,
  clipRadii: Radii,
  parentOpacity: number,
  parentPlacement: Placement
): void {
  const { style } = node;
  if (style.display === 'none') return;
  // Opacity multiplies down the tree, so overlapping children of a faded
  // node fade one by one, not as a group as in CSS.
  const [ownOpacity] = animated(node, 'opacity', [style.opacity ?? 1], context);
  const opacity = parentOpacity * ownOpacity;
  if (opacity <= 0) return;

  const transform = animated(
    node,
    'transform',
    transformValue(style.transform),
    context
  );
  const placement = placeNode(parentPlacement, node.rect, transform);
  const { scale } = placement;
  const rect = placeRect(node.rect, placement);
  const radii = scaleRadii(
    fitRadii(cornerRadii(style.borderRadius), node.rect),
    scale
  );
  const borderWidth = (style.borderWidth ?? 0) * scale;
  const fill = animatedColor(node, 'backgroundColor', context);
  const border = animatedColor(node, 'borderColor', context);
  const glass = style.backdrop === 'glass';
  const shadows = boxShadows(style.boxShadow);
  const box = { rect, radii, borderWidth, clip, clipRadii, opacity, scale };

  // The first shadow draws on top, as in CSS.
  for (let i = shadows.length - 1; i >= 0; i--)
    if (!shadows[i].inset) writeShadow(stream, context, box, shadows[i]);
  // An effect draws its own content, so it draws with no fill or border.
  if (node.effect || glass || fill[3] > 0 || (borderWidth > 0 && border[3] > 0))
    stream.pushRect({
      rect,
      clip,
      clipRadii,
      radii,
      fill,
      border,
      borderWidth,
      opacity,
      kind: glass ? PrimitiveKind.Glass : PrimitiveKind.Rect,
      outset: node.effect ? node.effectOutset * scale : 0,
      effect: node.effect,
      effectParams: node.effectParams,
      node,
    });
  for (let i = shadows.length - 1; i >= 0; i--)
    if (shadows[i].inset) writeShadow(stream, context, box, shadows[i]);

  const outerClip = clip;
  const outerRadii = clipRadii;
  if (style.overflow === 'hidden') {
    // Nested clips keep only the innermost corner radii.
    clip = intersect(clip, placeRect(innerBox(node), placement));
    clipRadii = radii.map((r) => Math.max(0, r - borderWidth)) as Radii;
  }
  if (node.icon && context.icons)
    writeIcon(
      node,
      stream,
      context,
      context.icons,
      clip,
      clipRadii,
      opacity,
      placement
    );
  if (node.text && context.font)
    writeText(
      node,
      stream,
      context,
      context.font,
      clip,
      clipRadii,
      opacity,
      placement
    );
  for (const child of node.children)
    writeNode(child, stream, context, clip, clipRadii, opacity, placement);
  // The ring draws over the node's children, and its parent's clip cuts it,
  // as with a CSS outline.
  if (node === context.focus)
    writeFocusRing(stream, context, box, outerClip, outerRadii);
}

/** A node's box as it draws, on the surface. */
interface PlacedBox {
  rect: Rect;
  radii: Radii;
  borderWidth: number;
  clip: Rect;
  clipRadii: Radii;
  opacity: number;
  scale: number;
}

function boxShadows(
  value: UIBoxShadow | UIBoxShadow[] | undefined
): UIBoxShadow[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * One box shadow. A transform scales it with the box. The shader blurs the
 * shadow's box with a Gaussian whose deviation is half the CSS blur radius.
 */
function writeShadow(
  stream: PrimitiveStream,
  context: WriteContext,
  box: PlacedBox,
  shadow: UIBoxShadow
): void {
  const color = resolveColor(shadow.color, context.theme);
  if (color[3] <= 0) return;
  const { scale } = box;
  const x = (shadow.x ?? 0) * scale;
  const y = (shadow.y ?? 0) * scale;
  const sigma = (Math.max(0, shadow.blur ?? 0) / 2) * scale;
  const spread = (shadow.spread ?? 0) * scale;
  const inset = shadow.inset ?? false;
  let shapeRadii: Radii;
  if (inset) {
    // The hole is the padding box, moved and shrunk by the spread.
    const padding = box.radii.map((r) => Math.max(0, r - box.borderWidth));
    shapeRadii = padding.map((r) => spreadRadius(r, -spread)) as Radii;
  } else {
    shapeRadii = box.radii.map((r) => spreadRadius(r, spread)) as Radii;
  }
  stream.pushRect({
    rect: box.rect,
    clip: box.clip,
    clipRadii: box.clipRadii,
    radii: box.radii,
    fill: color,
    border: shapeRadii,
    borderWidth: box.borderWidth,
    opacity: box.opacity,
    kind: inset ? PrimitiveKind.InsetShadow : PrimitiveKind.Shadow,
    // The quad covers the blur's tail, three deviations out.
    outset: inset
      ? 0
      : Math.max(Math.abs(x), Math.abs(y)) + Math.max(0, spread) + 3 * sigma,
    effectParams: [x, y, sigma, spread],
  });
}

/**
 * A corner radius grown by a spread, as CSS grows a shadow's corners. A
 * small radius grows less than the spread, so a square corner stays square.
 * A negative spread shrinks it.
 */
export function spreadRadius(radius: number, spread: number): number {
  if (spread <= 0) return Math.max(0, radius + spread);
  const ratio = radius / spread;
  const factor = ratio < 1 ? 1 + (ratio - 1) ** 3 : 1;
  return radius + spread * factor;
}

function scaleRadii(radii: Radii, scale: number): Radii {
  return scale === 1 ? radii : (radii.map((r) => r * scale) as Radii);
}

/**
 * The DOM's focus ring: `outline: 2px solid` in `primary400`, with no
 * offset. A rounded box gets a ring with its radii plus the width, as Chrome
 * draws it.
 */
const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_COLOR: UIColor = 'primary400';

function writeFocusRing(
  stream: PrimitiveStream,
  context: WriteContext,
  box: PlacedBox,
  clip: Rect,
  clipRadii: Radii
): void {
  const w = FOCUS_RING_WIDTH * box.scale;
  const { rect, radii } = box;
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
    border: resolveColor(FOCUS_RING_COLOR, context.theme),
    borderWidth: w,
    opacity: box.opacity,
  });
}

function writeText(
  node: UINode,
  stream: PrimitiveStream,
  context: WriteContext,
  font: UIFont,
  clip: Rect,
  clipRadii: Radii,
  opacity: number,
  placement: Placement
): void {
  const color = textColor(node, context);
  if (color[3] <= 0) return;
  const style = resolveTextStyle(node);
  const box = contentBox(node);
  const glyphs = placeText(node, font, style, box, context.pixelRatio ?? 1);
  for (const { rect, atlas } of glyphs)
    stream.pushAtlas({
      kind: PrimitiveKind.Glyph,
      rect: placeRect(rect, placement),
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
  context: WriteContext,
  icons: UIIcons,
  clip: Rect,
  clipRadii: Radii,
  opacity: number,
  placement: Placement
): void {
  const icon = icons.icon(node.icon!);
  if (!icon) return;
  const color = textColor(node, context);
  if (color[3] <= 0) return;
  const box = contentBox(node);
  const size = Math.min(box.width, box.height);
  if (size <= 0) return;
  const ratio = context.pixelRatio ?? 1;
  const snap = (v: number) => Math.round(v * ratio) / ratio;
  const x = snap(box.x + (box.width - size) / 2);
  const y = snap(box.y + (box.height - size) / 2);
  const { planeBounds: plane, atlasBounds: atlas } = icon;
  const rect = {
    x: x + plane.left * size,
    y: y + plane.top * size,
    width: (plane.right - plane.left) * size,
    height: (plane.bottom - plane.top) * size,
  };
  stream.pushAtlas({
    kind: PrimitiveKind.Icon,
    rect: placeRect(rect, placement),
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
