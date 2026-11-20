import { innerBox } from './layout';
import type { Sides } from './style';
import type { Rect, UINode } from './UINode';

/**
 * Scrolling. A node with `overflow: 'scroll'` is a scroll container. Layout
 * places its children, then moves them by its scroll offset, so each rect
 * is where the node shows on the surface. A scroll moves the children's
 * rects again, with no layout.
 */

/** The scrollbar's width, its gap to the edge, and the thumb's least length, in CSS pixels. */
export const SCROLLBAR_SIZE = 6;
export const SCROLLBAR_INSET = 2;
export const SCROLLBAR_MIN_THUMB = 24;
/** The space a scrollbar keeps clear beside the content: the bar and its inset on each side. */
export const SCROLLBAR_GUTTER = SCROLLBAR_SIZE + 2 * SCROLLBAR_INSET;

/** The space round a node that `scrollIntoView` keeps in view, for the focus ring. */
const REVEAL_MARGIN = 4;

export function isScrollContainer(node: UINode): boolean {
  return node.style.overflow === 'scroll';
}

/** Moves the node's descendants by `dx` and `dy`. */
export function translateChildren(node: UINode, dx: number, dy: number): void {
  for (const child of node.children) {
    const { rect } = child;
    child.rect = { ...rect, x: rect.x + dx, y: rect.y + dy };
    translateChildren(child, dx, dy);
  }
}

/**
 * The size of a scroll container's content, from the inside of its border:
 * the far edge of its children, with their margins, and the end padding.
 * It is at least the size of the inside of the border. Layout must have
 * placed the children with no scroll.
 */
export function contentSize(node: UINode): { width: number; height: number } {
  const box = innerBox(node);
  let width = box.width;
  let height = box.height;
  for (const child of node.children) {
    if (child.style.display === 'none') continue;
    const { rect, margin } = child;
    width = Math.max(
      width,
      rect.x + rect.width + margin[1] - box.x + node.padding[1]
    );
    height = Math.max(
      height,
      rect.y + rect.height + margin[2] - box.y + node.padding[2]
    );
  }
  return { width, height };
}

/**
 * Adds the scrollbar gutters to a scroll container's padding: on the right
 * for a vertical bar and at the bottom for a horizontal one. The padding
 * goes inside the gutter, as with CSS `scrollbar-gutter`.
 */
export function withGutters(node: UINode, padding: Sides): Sides {
  const { x, y } = node.scrollGutters;
  if (!isScrollContainer(node) || (!x && !y)) return padding;
  const [top, right, bottom, left] = padding;
  return [
    top,
    right + (y ? SCROLLBAR_GUTTER : 0),
    bottom + (x ? SCROLLBAR_GUTTER : 0),
    left,
  ];
}

/** How far the node can scroll on each axis. It is 0 for a node that does not scroll. */
export function maxScroll(node: UINode): { x: number; y: number } {
  if (!isScrollContainer(node)) return { x: 0, y: 0 };
  const box = innerBox(node);
  return {
    x: Math.max(0, node.scrollWidth - box.width),
    y: Math.max(0, node.scrollHeight - box.height),
  };
}

/** True when the node can scroll by some of `dx` and `dy`, from where it is. */
export function canScroll(node: UINode, dx: number, dy: number): boolean {
  const max = maxScroll(node);
  return (
    (dx < 0 && node.scrollLeft > 0) ||
    (dx > 0 && node.scrollLeft < max.x) ||
    (dy < 0 && node.scrollTop > 0) ||
    (dy > 0 && node.scrollTop < max.y)
  );
}

/** The nearest scroll container from the node up, the node first, that can scroll by the delta. */
export function scrollerFor(
  node: UINode | null,
  dx: number,
  dy: number
): UINode | null {
  for (let n = node; n; n = n.parent)
    if (isScrollContainer(n) && canScroll(n, dx, dy)) return n;
  return null;
}

/** The first scroll container in tree order that shows and can scroll by the delta. */
export function firstScroller(
  root: UINode,
  dx: number,
  dy: number
): UINode | null {
  const { style } = root;
  if (style.display === 'none' || style.opacity === 0) return null;
  if (isScrollContainer(root) && canScroll(root, dx, dy)) return root;
  for (const child of root.children) {
    const found = firstScroller(child, dx, dy);
    if (found) return found;
  }
  return null;
}

/**
 * Scrolls the node's scroll containers, the nearest first, the least that
 * shows the node with a small margin. A node taller or wider than the view
 * shows its start.
 */
export function scrollIntoView(node: UINode): void {
  for (let a = node.parent; a; a = a.parent) {
    if (!isScrollContainer(a)) continue;
    const view = innerBox(a);
    const { rect } = node;
    a.scrollBy(
      revealDelta(rect.x, rect.width, view.x, view.width),
      revealDelta(rect.y, rect.height, view.y, view.height)
    );
  }
}

/** The scroll on one axis that brings a span into a view. */
function revealDelta(
  start: number,
  length: number,
  viewStart: number,
  viewLength: number
): number {
  const margin = Math.min(
    REVEAL_MARGIN,
    Math.max(0, (viewLength - length) / 2)
  );
  const before = start - margin - viewStart;
  if (before < 0) return before;
  const after = start + length + margin - (viewStart + viewLength);
  return after > 0 ? Math.min(after, before) : 0;
}

export interface Scrollbar {
  vertical: boolean;
  /** The length the thumb moves in, in surface CSS pixels. */
  track: Rect;
  thumb: Rect;
}

/**
 * The scrollbars of a scroll container: one on each axis where the content
 * is larger than the node. A vertical bar runs down the inside of the right
 * edge and a horizontal one along the bottom, in the gutter that layout
 * keeps clear of the content.
 */
export function scrollbars(node: UINode): Scrollbar[] {
  const max = maxScroll(node);
  if (max.x <= 0 && max.y <= 0) return [];
  const box = innerBox(node);
  const both = max.x > 0 && max.y > 0;
  // With two bars, each stops short of the corner the other one runs into.
  const corner = both ? SCROLLBAR_SIZE + SCROLLBAR_INSET : 0;
  const bars: Scrollbar[] = [];
  if (max.y > 0) {
    const track = {
      x: box.x + box.width - SCROLLBAR_INSET - SCROLLBAR_SIZE,
      y: box.y + SCROLLBAR_INSET,
      width: SCROLLBAR_SIZE,
      height: Math.max(0, box.height - 2 * SCROLLBAR_INSET - corner),
    };
    const [start, length] = thumbSpan(
      track.height,
      box.height,
      node.scrollHeight,
      node.scrollTop,
      max.y
    );
    bars.push({
      vertical: true,
      track,
      thumb: { ...track, y: track.y + start, height: length },
    });
  }
  if (max.x > 0) {
    const track = {
      x: box.x + SCROLLBAR_INSET,
      y: box.y + box.height - SCROLLBAR_INSET - SCROLLBAR_SIZE,
      width: Math.max(0, box.width - 2 * SCROLLBAR_INSET - corner),
      height: SCROLLBAR_SIZE,
    };
    const [start, length] = thumbSpan(
      track.width,
      box.width,
      node.scrollWidth,
      node.scrollLeft,
      max.x
    );
    bars.push({
      vertical: false,
      track,
      thumb: { ...track, x: track.x + start, width: length },
    });
  }
  return bars;
}

/** The thumb's offset in its track and its length. The length is the share of the content that shows. */
function thumbSpan(
  track: number,
  view: number,
  content: number,
  scroll: number,
  max: number
): [number, number] {
  const length = Math.min(
    track,
    Math.max(SCROLLBAR_MIN_THUMB, (track * view) / content)
  );
  return [max > 0 ? ((track - length) * scroll) / max : 0, length];
}

/** The scroll that puts the thumb's start at `thumbStart` along its track. */
export function scrollForThumb(
  node: UINode,
  bar: Scrollbar,
  thumbStart: number
): number {
  const max = maxScroll(node);
  const [trackStart, trackLength, thumbLength, range] = bar.vertical
    ? [bar.track.y, bar.track.height, bar.thumb.height, max.y]
    : [bar.track.x, bar.track.width, bar.thumb.width, max.x];
  const free = trackLength - thumbLength;
  return free > 0 ? ((thumbStart - trackStart) / free) * range : 0;
}
