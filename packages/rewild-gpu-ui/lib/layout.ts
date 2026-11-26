import {
  FlexAlign,
  Length,
  resolveEdges,
  resolveLength,
  Sides,
  UIStyle,
} from './style';
import { contentSize, isScrollContainer, withGutters } from './scroll';
import { naturalSize, UIImageLookup } from './image';
import { MeasureFunction, Rect, UINode } from './UINode';

/**
 * Flex layout, written to CSS semantics so a browser can check it. Every node
 * is a flex container with `box-sizing: border-box`. Min sizes default to 0:
 * there is no automatic minimum size from the content. Absolute nodes are
 * placed in the padding box of their parent. The items of a scroll container
 * do not shrink, so they overflow it and it scrolls. A scroll container
 * keeps a gutter clear for each scrollbar it has, so a pass that adds or
 * removes one lays the tree out again.
 */

interface Size {
  width: number;
  height: number;
}

/** Sizes that are undefined when they come from the content. */
interface Base {
  width: number | undefined;
  height: number | undefined;
}

type Axis = keyof Size;

/** A node's style resolved against its containing block. */
interface Rules {
  margin: Sides;
  padding: Sides;
  /** Padding and border, per axis. */
  extra: Size;
  /** Margins, per axis. */
  margins: Size;
  /** `width` and `height`, before min and max. */
  size: Base;
  /** At least the padding and border. */
  min: Size;
  max: Size;
}

interface Item {
  node: UINode;
  rules: Rules;
  align: FlexAlign;
  grow: number;
  shrink: number;
  base: number;
  hypothetical: number;
  /** The cross size known before layout, as `width` or `height` or a stretch. */
  knownCross: number | undefined;
  target: number;
  frozen: boolean;
  violation: number;
  /** The used cross size, or -1 until it is known. */
  cross: number;
}

const EPSILON = 1e-3;

/**
 * The most passes for one layout. A gutter can make content overflow on the
 * other axis, so a second pass can add the second gutter.
 */
const MAX_PASSES = 3;

/** Measured sizes per node, for one layout pass. */
let cache = new Map<UINode, Map<string, Size>>();
/** The images of the tree being laid out. */
let lookup: UIImageLookup | null = null;
/** True when a scroll container gained or lost a gutter in this pass. */
let guttersChanged = false;

/** Places each node of the tree in surface CSS pixels. */
/**
 * Lays out the tree in a box of `width` by `height`. `images` gives the size
 * of each image a node takes its size from. With none, an image node with no
 * size has none.
 */
export function layoutTree(
  root: UINode,
  width: number,
  height: number,
  images: UIImageLookup | null = null
): void {
  lookup = images;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    cache = new Map();
    guttersChanged = false;
    root.rect = { x: 0, y: 0, width, height };
    layoutNode(root, width, height, { width, height }, { width, height }, true);
    if (!guttersChanged) break;
  }
  cache = new Map();
  lookup = null;
}

/** The box inside the border, which children are placed and clipped in. */
export function innerBox(node: UINode): Rect {
  const border = node.style.borderWidth ?? 0;
  const { x, y, width, height } = node.rect;
  return {
    x: x + border,
    y: y + border,
    width: Math.max(0, width - 2 * border),
    height: Math.max(0, height - 2 * border),
  };
}

function rules(node: UINode, cb: Base): Rules {
  const s = node.style;
  const border = s.borderWidth ?? 0;
  const padding = withGutters(node, resolveEdges(s.padding, cb.width));
  const margin = resolveEdges(s.margin, cb.width);
  const extra = {
    width: padding[1] + padding[3] + 2 * border,
    height: padding[0] + padding[2] + 2 * border,
  };
  return {
    margin,
    padding,
    extra,
    margins: { width: margin[1] + margin[3], height: margin[0] + margin[2] },
    size: {
      width: resolveLength(s.width, cb.width),
      height: resolveLength(s.height, cb.height),
    },
    min: {
      width: Math.max(extra.width, resolveLength(s.minWidth, cb.width) ?? 0),
      height: Math.max(
        extra.height,
        resolveLength(s.minHeight, cb.height) ?? 0
      ),
    },
    max: {
      width: resolveLength(s.maxWidth, cb.width) ?? Infinity,
      height: resolveLength(s.maxHeight, cb.height) ?? Infinity,
    },
  };
}

/** Clamps to min and max. Min wins, as in CSS. */
function clamp(r: Rules, axis: Axis, value: number): number {
  return Math.max(r.min[axis], Math.min(r.max[axis], value));
}

/** `width` or `height` clamped, or undefined when it comes from the content. */
function definite(r: Rules, axis: Axis): number | undefined {
  const size = r.size[axis];
  return size === undefined ? undefined : clamp(r, axis, size);
}

interface LayoutOptions {
  /**
   * Percentage heights of the children resolve only against a definite
   * height, as in CSS. Widths always resolve. Defaults to true.
   */
  definiteHeight?: boolean;
  /** Skips the node's own min and max, for a content-based flex basis. */
  unclamped?: boolean;
}

/** Lays out without placing children, and caches the result for the pass. */
function measureNode(
  node: UINode,
  width: number | undefined,
  height: number | undefined,
  available: Size,
  cb: Base,
  options: LayoutOptions = {}
): Size {
  if (width !== undefined && height !== undefined) return { width, height };
  const { definiteHeight = true, unclamped = false } = options;
  const key = `${width} ${height} ${available.width} ${available.height} ${cb.width} ${cb.height} ${definiteHeight} ${unclamped}`;
  let entries = cache.get(node);
  const hit = entries?.get(key);
  if (hit) return hit;
  const size = layoutNode(node, width, height, available, cb, false, options);
  if (!entries) cache.set(node, (entries = new Map()));
  entries.set(key, size);
  return size;
}

/**
 * Sizes a node's border box. An undefined `width` or `height` comes from the
 * content, up to `available`. With `place`, the node's `rect` must be set and
 * its children are placed.
 */
function layoutNode(
  node: UINode,
  width: number | undefined,
  height: number | undefined,
  available: Size,
  cb: Base,
  place: boolean,
  options: LayoutOptions = {}
): Size {
  const { definiteHeight = true, unclamped = false } = options;
  const r = rules(node, cb);
  const inner: Base = {
    width: width === undefined ? undefined : Math.max(0, width - r.extra.width),
    height:
      height === undefined ? undefined : Math.max(0, height - r.extra.height),
  };
  const base: Base = {
    width: inner.width,
    height: definiteHeight ? inner.height : undefined,
  };
  const innerAvailable = {
    width: Math.max(0, available.width - r.extra.width),
    height: Math.max(0, available.height - r.extra.height),
  };
  const bounds = unclamped
    ? {
        min: { width: 0, height: 0 },
        max: { width: Infinity, height: Infinity },
      }
    : {
        min: {
          width: r.min.width - r.extra.width,
          height: r.min.height - r.extra.height,
        },
        max: {
          width: Math.max(0, r.max.width - r.extra.width),
          height: Math.max(0, r.max.height - r.extra.height),
        },
      };
  const border = node.style.borderWidth ?? 0;
  const origin = place
    ? {
        x: node.rect.x + border + r.padding[3],
        y: node.rect.y + border + r.padding[0],
      }
    : null;

  let content = node.measure
    ? measureContent(node.measure, inner, innerAvailable, bounds)
    : layoutFlex(node, inner, base, innerAvailable, bounds, origin);
  // An image node's content size is its image's, as with a CSS `img`. Its
  // children still lay out in the box, and do not size it.
  if (node.image !== null) content = imageContent(node, inner, bounds);

  if (place) {
    node.padding = r.padding;
    layoutAbsolute(node, r.padding);
    if (isScrollContainer(node)) {
      const size = contentSize(node);
      setGutters(node, size);
      node.applyScroll(size.width, size.height);
    }
  }
  return {
    width: width ?? content.width + r.extra.width,
    height: height ?? content.height + r.extra.height,
  };
}

/**
 * The content size of an image node: the image's natural size. With one side
 * known, the other keeps the image's aspect ratio. Before the image loads, it
 * is 0 by 0.
 */
function imageContent(
  node: UINode,
  inner: Base,
  bounds: { min: Size; max: Size }
): Size {
  const image = lookup?.image(node.image!);
  const natural = image ? naturalSize(image) : { width: 0, height: 0 };
  const ratio =
    natural.width > 0 && natural.height > 0
      ? natural.width / natural.height
      : 0;
  const { width, height } = inner;
  let w = natural.width;
  let h = natural.height;
  if (width === undefined && height !== undefined && ratio) w = height * ratio;
  if (height === undefined && width !== undefined && ratio) h = width / ratio;
  return {
    width: width ?? fit(bounds, 'width', w),
    height: height ?? fit(bounds, 'height', h),
  };
}

/** Gives a scroll container a gutter on each axis its content overflows. */
function setGutters(node: UINode, content: Size): void {
  const box = innerBox(node);
  const x = content.width > box.width + EPSILON;
  const y = content.height > box.height + EPSILON;
  const gutters = node.scrollGutters;
  if (gutters.x === x && gutters.y === y) return;
  node.scrollGutters = { x, y };
  guttersChanged = true;
}

function measureContent(
  measure: MeasureFunction,
  inner: Base,
  available: Size,
  bounds: { min: Size; max: Size }
): Size {
  const limit = inner.width ?? Math.min(available.width, bounds.max.width);
  const size = measure(limit);
  return {
    width: inner.width ?? fit(bounds, 'width', size.width),
    height: inner.height ?? fit(bounds, 'height', size.height),
  };
}

/**
 * Sizes the content box from the in-flow children, and places them when
 * `origin` is set. `inner` is the known content size and `base` the part of
 * it that percentages resolve against.
 */
function layoutFlex(
  node: UINode,
  inner: Base,
  base: Base,
  available: Size,
  bounds: { min: Size; max: Size },
  origin: { x: number; y: number } | null
): Size {
  const { style } = node;
  const direction = style.flexDirection ?? 'row';
  const row = direction.startsWith('row');
  const reverse = direction.endsWith('reverse');
  const wrap = style.flexWrap === 'wrap';
  const gap = style.gap ?? 0;
  const main: Axis = row ? 'width' : 'height';
  const cross: Axis = row ? 'height' : 'width';
  let mainSize = inner[main];
  let crossSize = inner[cross];
  const scrolls = isScrollContainer(node);

  const items: Item[] = [];
  for (const child of node.children) {
    if (child.style.display === 'none') {
      if (origin) child.rect = { ...origin, width: 0, height: 0 };
      continue;
    }
    if (child.style.position === 'absolute') continue;

    const r = rules(child, base);
    let align = alignOf(child.style, style);
    // Only an auto cross size stretches. A percentage that cannot resolve
    // sizes as auto but does not stretch, as in CSS.
    if (align === 'stretch' && child.style[cross] !== undefined)
      align = 'flex-start';
    const stretchCross =
      align === 'stretch' && !wrap && crossSize !== undefined
        ? clamp(r, cross, crossSize - r.margins[cross])
        : undefined;
    const knownCross = definite(r, cross) ?? stretchCross;
    const basis = flexBasis(child, r, inner, base, available, row, knownCross);
    items.push({
      node: child,
      rules: r,
      align,
      grow: child.style.flexGrow ?? 0,
      // Items in a scroll container keep their size and overflow it, as
      // CSS items do with their automatic minimum size.
      shrink: scrolls ? 0 : child.style.flexShrink ?? 1,
      base: basis,
      hypothetical: clamp(r, main, basis),
      knownCross,
      target: 0,
      frozen: false,
      violation: 0,
      cross: knownCross ?? -1,
    });
  }

  // Break into lines at the main size, or at the space there is.
  const limit = mainSize ?? Math.min(available[main], bounds.max[main]);
  const lines: Item[][] = [[]];
  let used = 0;
  for (const item of items) {
    let line = lines[lines.length - 1];
    const outer = item.hypothetical + item.rules.margins[main];
    if (wrap && line.length && used + gap + outer > limit + EPSILON) {
      line = [];
      lines.push(line);
      used = 0;
    }
    used += (line.length ? gap : 0) + outer;
    line.push(item);
  }

  if (mainSize === undefined) {
    const content = row
      ? maxContentWidth(items, gap, inner, base, available)
      : Math.max(
          ...lines.map((line) =>
            outerSum(line, main, gap, (i) => i.hypothetical)
          )
        );
    let size = Math.min(content, available[main]);
    // Fit-content never goes below the min-content width, as in CSS.
    if (row && content > available[main])
      size = Math.max(size, minContentWidth(items, gap, wrap, base));
    mainSize = fit(bounds, main, size);
  }
  for (const line of lines) resolveFlexible(line, mainSize, gap, main);

  // A height is definite when it is set, stretched, or the main size of a
  // container with a definite height, as CSS flexbox 9.8.
  const definiteOf = (item: Item): boolean =>
    item.rules.size.height !== undefined ||
    (row ? item.align === 'stretch' : base.height !== undefined);

  // Cross sizes from the content, for items that do not know theirs yet.
  const crossAvailable = crossSize ?? available[cross];
  for (const item of items) {
    if (item.cross >= 0) continue;
    const r = item.rules;
    const size = row
      ? measureNode(
          item.node,
          item.target,
          undefined,
          { width: item.target, height: Infinity },
          base,
          { definiteHeight: definiteOf(item) }
        ).height
      : measureNode(
          item.node,
          undefined,
          item.target,
          {
            width: Math.max(0, crossAvailable - r.margins.width),
            height: item.target,
          },
          base,
          { definiteHeight: definiteOf(item) }
        ).width;
    item.cross = clamp(r, cross, size);
  }

  const lineCross = lines.map((line) =>
    Math.max(0, ...line.map((i) => i.cross + i.rules.margins[cross]))
  );
  const linesTotal =
    lineCross.reduce((t, c) => t + c, 0) + gap * (lines.length - 1);
  if (crossSize === undefined) crossSize = fit(bounds, cross, linesTotal);
  if (!wrap) lineCross[0] = crossSize;
  else if (crossSize > linesTotal) {
    // Lines share the space left over, as `align-content: normal`.
    const extra = (crossSize - linesTotal) / lines.length;
    for (let i = 0; i < lineCross.length; i++) lineCross[i] += extra;
  }

  for (let i = 0; i < lines.length; i++)
    for (const item of lines[i])
      if (item.align === 'stretch')
        item.cross = clamp(
          item.rules,
          cross,
          lineCross[i] - item.rules.margins[cross]
        );

  const contentSize = row
    ? { width: mainSize, height: crossSize }
    : { width: crossSize, height: mainSize };
  if (!origin) return contentSize;

  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    placeLine(lines[i], lineStart, lineCross[i], mainSize, gap, origin, {
      row,
      reverse,
      justify: style.justifyContent ?? 'flex-start',
      cb: base,
      definiteOf,
    });
    lineStart += lineCross[i] + gap;
  }
  return contentSize;
}

function alignOf(child: UIStyle, parent: UIStyle): FlexAlign {
  return child.alignSelf && child.alignSelf !== 'auto'
    ? child.alignSelf
    : parent.alignItems ?? 'stretch';
}

function fit(bounds: { min: Size; max: Size }, axis: Axis, value: number) {
  return Math.max(bounds.min[axis], Math.min(bounds.max[axis], value));
}

function outerSum(
  line: Item[],
  main: Axis,
  gap: number,
  size: (item: Item) => number
): number {
  let total = gap * Math.max(0, line.length - 1);
  for (const item of line) total += size(item) + item.rules.margins[main];
  return total;
}

/** The flex base size, from `flexBasis`, then the main size, then the content. */
function flexBasis(
  node: UINode,
  r: Rules,
  inner: Base,
  base: Base,
  available: Size,
  row: boolean,
  knownCross: number | undefined
): number {
  const main: Axis = row ? 'width' : 'height';
  const { flexBasis } = node.style;
  if (hasBasis(node.style)) {
    const basis = resolveLength(flexBasis as Length, base[main]);
    if (basis !== undefined) return basis;
  }
  return mainContent(node, r, inner, base, available, row, knownCross);
}

/**
 * The max-content width of a row. Each item takes its content width when its
 * grow or shrink factor lets it move off its base size, as Chrome does.
 */
function maxContentWidth(
  items: Item[],
  gap: number,
  inner: Base,
  base: Base,
  available: Size
): number {
  return outerSum(items, 'width', gap, (i) => {
    if (!hasBasis(i.node.style)) return i.hypothetical;
    const content = clamp(
      i.rules,
      'width',
      mainContent(i.node, i.rules, inner, base, available, true, i.knownCross)
    );
    const moves =
      (content > i.base && i.grow > 0) || (content < i.base && i.shrink > 0);
    return moves ? content : i.hypothetical;
  });
}

/** The narrowest a row can be: its items at their min-content widths. */
function minContentWidth(
  items: Item[],
  gap: number,
  wrap: boolean,
  base: Base
): number {
  const widths = items.map((i) => {
    const width =
      i.rules.size.width ??
      measureNode(
        i.node,
        undefined,
        i.knownCross,
        { width: 0, height: i.knownCross ?? Infinity },
        base
      ).width;
    return clamp(i.rules, 'width', width) + i.rules.margins.width;
  });
  if (wrap) return Math.max(0, ...widths);
  return widths.reduce((t, w) => t + w, gap * Math.max(0, items.length - 1));
}

function hasBasis(style: UIStyle): boolean {
  return style.flexBasis !== undefined && style.flexBasis !== 'auto';
}

/** The main size from `width` or `height`, or else from the content. */
function mainContent(
  node: UINode,
  r: Rules,
  inner: Base,
  base: Base,
  available: Size,
  row: boolean,
  knownCross: number | undefined
): number {
  const main: Axis = row ? 'width' : 'height';
  if (r.size[main] !== undefined) return r.size[main]!;
  if (row)
    return measureNode(
      node,
      undefined,
      knownCross,
      { width: Infinity, height: knownCross ?? available.height },
      base,
      { unclamped: true }
    ).width;
  const width = knownCross;
  return measureNode(
    node,
    width,
    undefined,
    {
      width:
        width ??
        Math.max(0, (inner.width ?? available.width) - r.margins.width),
      height: Infinity,
    },
    base,
    { unclamped: true }
  ).height;
}

/** Grows or shrinks the items of one line to fill `space`, as CSS flexbox 9.7. */
function resolveFlexible(
  line: Item[],
  space: number,
  gap: number,
  main: Axis
): void {
  const growing = outerSum(line, main, gap, (i) => i.hypothetical) < space;
  for (const item of line) {
    const factor = growing ? item.grow : item.shrink;
    item.target = item.hypothetical;
    item.frozen =
      factor === 0 ||
      (growing ? item.base > item.hypothetical : item.base < item.hypothetical);
  }
  const free = () =>
    space - outerSum(line, main, gap, (i) => (i.frozen ? i.target : i.base));
  const initialFree = free();

  for (;;) {
    const open = line.filter((i) => !i.frozen);
    if (!open.length) return;
    let remaining = free();
    const factors = open.reduce((t, i) => t + (growing ? i.grow : i.shrink), 0);
    if (factors < 1 && Math.abs(initialFree * factors) < Math.abs(remaining))
      remaining = initialFree * factors;

    if (growing) {
      for (const item of open)
        item.target = item.base + (remaining * item.grow) / factors;
    } else {
      // Shrink in proportion to the base size inside padding and border.
      const scaled = (i: Item) =>
        i.shrink * Math.max(0, i.base - i.rules.extra[main]);
      const total = open.reduce((t, i) => t + scaled(i), 0);
      for (const item of open)
        item.target =
          total > 0
            ? item.base - (Math.abs(remaining) * scaled(item)) / total
            : item.base;
    }

    let violation = 0;
    for (const item of open) {
      const clamped = clamp(item.rules, main, item.target);
      item.violation = clamped - item.target;
      item.target = clamped;
      violation += item.violation;
    }
    for (const item of open)
      if (
        Math.abs(violation) < EPSILON ||
        (violation > 0 && item.violation > 0) ||
        (violation < 0 && item.violation < 0)
      )
        item.frozen = true;
  }
}

function placeLine(
  line: Item[],
  lineStart: number,
  lineCross: number,
  mainSize: number,
  gap: number,
  origin: { x: number; y: number },
  options: {
    row: boolean;
    reverse: boolean;
    justify: NonNullable<UIStyle['justifyContent']>;
    cb: Base;
    definiteOf: (item: Item) => boolean;
  }
): void {
  const { row, reverse, justify, cb, definiteOf } = options;
  const main: Axis = row ? 'width' : 'height';
  const cross: Axis = row ? 'height' : 'width';
  const count = line.length;
  const free = mainSize - outerSum(line, main, gap, (i) => i.target);

  let offset = 0;
  let between = gap;
  if (justify === 'flex-end') offset = free;
  else if (justify === 'center') offset = free / 2;
  else if (justify === 'space-between') {
    if (free > 0 && count > 1) between += free / (count - 1);
  } else if (justify === 'flex-start') {
    // The default: items start at main-start.
  } else if (free < 0) {
    // space-around and space-evenly fall back to safe center: on overflow,
    // they align to the left or top, which is main-end when reversed.
    if (reverse) offset = free;
  } else if (justify === 'space-around') {
    offset = free / count / 2;
    between += free / count;
  } else if (justify === 'space-evenly') {
    offset = free / (count + 1);
    between += free / (count + 1);
  }

  let cursor = offset;
  for (const item of line) {
    const { margin } = item.rules;
    // Margins in top, right, bottom, left order.
    const mainStart = row
      ? reverse
        ? margin[1]
        : margin[3]
      : reverse
      ? margin[2]
      : margin[0];
    const crossStart = row ? margin[0] : margin[3];
    const position = cursor + mainStart;
    cursor += item.target + item.rules.margins[main] + between;
    const mainPos = reverse ? mainSize - position - item.target : position;

    const crossFree = lineCross - item.cross - item.rules.margins[cross];
    const crossPos =
      lineStart +
      crossStart +
      (item.align === 'flex-end'
        ? crossFree
        : item.align === 'center'
        ? crossFree / 2
        : 0);

    const width = row ? item.target : item.cross;
    const height = row ? item.cross : item.target;
    const s = item.node.style;
    const dx =
      resolveLength(s.left, cb.width) ??
      -(resolveLength(s.right, cb.width) ?? 0);
    const dy =
      resolveLength(s.top, cb.height) ??
      -(resolveLength(s.bottom, cb.height) ?? 0);
    item.node.rect = {
      x: origin.x + (row ? mainPos : crossPos) + dx,
      y: origin.y + (row ? crossPos : mainPos) + dy,
      width,
      height,
    };
    item.node.margin = margin;
    layoutNode(item.node, width, height, { width, height }, cb, true, {
      definiteHeight: definiteOf(item),
    });
  }
}

/** Places absolute children in the padding box. */
function layoutAbsolute(node: UINode, padding: Sides): void {
  const box = innerBox(node);
  const cb = { width: box.width, height: box.height };
  for (const child of node.children) {
    const s = child.style;
    if (s.position !== 'absolute' || s.display === 'none') continue;
    const r = rules(child, cb);
    const left = resolveLength(s.left, cb.width);
    const right = resolveLength(s.right, cb.width);
    const top = resolveLength(s.top, cb.height);
    const bottom = resolveLength(s.bottom, cb.height);

    let width =
      definite(r, 'width') ??
      (left !== undefined && right !== undefined
        ? clamp(r, 'width', cb.width - left - right - r.margins.width)
        : undefined);
    // An explicit alignSelf aligns the box between top and bottom, as CSS
    // does for absolute boxes.
    const align =
      s.alignSelf &&
      s.alignSelf !== 'auto' &&
      top !== undefined &&
      bottom !== undefined
        ? s.alignSelf
        : undefined;
    let height =
      definite(r, 'height') ??
      (top !== undefined &&
      bottom !== undefined &&
      (!align || align === 'stretch')
        ? clamp(r, 'height', cb.height - top - bottom - r.margins.height)
        : undefined);
    const definiteHeight = height !== undefined;
    if (width === undefined) {
      const space = cb.width - (left ?? 0) - (right ?? 0) - r.margins.width;
      width = measureNode(
        child,
        undefined,
        height,
        { width: Math.max(0, space), height: height ?? Infinity },
        cb
      ).width;
    }
    if (height === undefined)
      height = measureNode(
        child,
        width,
        undefined,
        { width, height: Infinity },
        cb,
        { definiteHeight: false }
      ).height;

    const x =
      left !== undefined
        ? left + r.margin[3]
        : right !== undefined
        ? cb.width - right - r.margin[1] - width
        : staticPosition(
            node,
            child,
            true,
            padding,
            cb.width - padding[1] - padding[3] - width - r.margins.width
          ) + r.margin[3];
    let y =
      top !== undefined
        ? top + r.margin[0]
        : bottom !== undefined
        ? cb.height - bottom - r.margin[2] - height
        : staticPosition(
            node,
            child,
            false,
            padding,
            cb.height - padding[0] - padding[2] - height - r.margins.height
          ) + r.margin[0];

    if (align) {
      const free = cb.height - top! - bottom! - height - r.margins.height;
      if (align === 'flex-end') y += free;
      else if (align === 'center') y += free / 2;
      // Keep the box inside the containing block, the start edge first.
      y = Math.max(0, Math.min(y, cb.height - height));
    }

    child.rect = { x: box.x + x, y: box.y + y, width, height };
    child.margin = r.margin;
    layoutNode(child, width, height, { width, height }, cb, true, {
      definiteHeight,
    });
  }
}

/**
 * Where an absolute node with no inset on an axis goes: in the content box,
 * aligned as if it were the only flex item, as in CSS.
 */
function staticPosition(
  parent: UINode,
  child: UINode,
  horizontal: boolean,
  padding: Sides,
  free: number
): number {
  const style = parent.style;
  const direction = style.flexDirection ?? 'row';
  const start = horizontal ? padding[3] : padding[0];
  let place: 'start' | 'center' | 'end' = 'start';
  if (horizontal === direction.startsWith('row')) {
    const justify = style.justifyContent ?? 'flex-start';
    if (justify === 'flex-end') place = 'end';
    else if (justify !== 'flex-start' && justify !== 'space-between')
      place = 'center';
    if (direction.endsWith('reverse') && place !== 'center')
      place = place === 'start' ? 'end' : 'start';
  } else {
    const align = alignOf(child.style, style);
    if (align === 'flex-end') place = 'end';
    else if (align === 'center') place = 'center';
  }
  return start + (place === 'end' ? free : place === 'center' ? free / 2 : 0);
}
