import type { Rect, UINode } from './UINode';

export type FocusDirection = 'up' | 'down' | 'left' | 'right';

/** A candidate must start past the near edge of the focused box, less this much. */
const EDGE_TOLERANCE = 1;
/** How much a step across the move counts against a step along it. */
const CROSS_WEIGHT = 5;
/** Breaks ties between candidates that overlap across the move: the centred one wins. */
const CENTRE_WEIGHT = 0.01;

/** True when the node shows and is focusable. */
export function canFocus(node: UINode): boolean {
  if (!node.style.focusable) return false;
  for (let n: UINode | null = node; n; n = n.parent)
    if (n.style.display === 'none') return false;
  return true;
}

/** The focusable nodes under the root that show, in tree order. */
export function focusableNodes(root: UINode, list: UINode[] = []): UINode[] {
  if (root.style.display === 'none') return list;
  if (root.style.focusable) list.push(root);
  for (const child of root.children) focusableNodes(child, list);
  return list;
}

/** The nearest focusable ancestor of the node, or the node itself. */
export function focusableAncestor(node: UINode): UINode | null {
  for (let n: UINode | null = node; n; n = n.parent)
    if (n.style.focusable) return canFocus(n) ? n : null;
  return null;
}

/**
 * The next node in tree order, or the one before it when `backward`. It wraps
 * at the ends. With no current node, it is the first or the last.
 */
export function nextInTabOrder(
  nodes: readonly UINode[],
  current: UINode | null,
  backward: boolean
): UINode | null {
  if (!nodes.length) return null;
  const index = current ? nodes.indexOf(current) : -1;
  if (index === -1) return backward ? nodes[nodes.length - 1] : nodes[0];
  const step = backward ? -1 : 1;
  return nodes[(index + step + nodes.length) % nodes.length];
}

/**
 * The nearest node in the direction from a box. A candidate must start past
 * the box's edge on that side. The score is the gap along the move plus the
 * gap across it, weighted, so a node in line wins over a nearer one to the
 * side.
 */
export function nearestInDirection(
  nodes: readonly UINode[],
  from: Rect,
  direction: FocusDirection
): UINode | null {
  const horizontal = direction === 'left' || direction === 'right';
  const forward = direction === 'right' || direction === 'down';
  const [fromStart, fromEnd] = span(from, horizontal);
  const [fromCrossStart, fromCrossEnd] = span(from, !horizontal);
  let best: UINode | null = null;
  let bestScore = Infinity;
  for (const node of nodes) {
    const [start, end] = span(node.rect, horizontal);
    const along = forward ? start - fromEnd : fromStart - end;
    if (along < -EDGE_TOLERANCE) continue;
    const [crossStart, crossEnd] = span(node.rect, !horizontal);
    const across = Math.max(
      0,
      crossStart - fromCrossEnd,
      fromCrossStart - crossEnd
    );
    const centre = Math.abs(
      crossStart + crossEnd - (fromCrossStart + fromCrossEnd)
    );
    const score =
      Math.max(0, along) + across * CROSS_WEIGHT + centre * CENTRE_WEIGHT;
    if (score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

function span(rect: Rect, horizontal: boolean): [number, number] {
  return horizontal
    ? [rect.x, rect.x + rect.width]
    : [rect.y, rect.y + rect.height];
}
