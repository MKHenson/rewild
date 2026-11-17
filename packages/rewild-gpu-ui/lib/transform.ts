import type { UITransform } from './style';
import type { TransitionValue } from './transition';
import type { Rect, UINode } from './UINode';

/**
 * Where a node's layout space lies on the surface: a surface point is
 * `scale` times the layout point, plus `x` and `y`. Transforms have no
 * rotation, so a rounded box stays a rounded box.
 */
export interface Placement {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: Placement = { scale: 1, x: 0, y: 0 };

/** A transform as x, y and scale, the form it transitions in. */
export function transformValue(transform: UITransform | undefined): number[] {
  return [transform?.x ?? 0, transform?.y ?? 0, transform?.scale ?? 1];
}

/** The transform the node drew with: its value part way through a transition, or its style. */
export function drawnTransform(node: UINode): TransitionValue {
  return (
    node.transitions?.shown('transform') ?? transformValue(node.style.transform)
  );
}

/**
 * Adds a node's transform to its parent's placement. The node scales about
 * the centre of its layout box, then moves.
 */
export function placeNode(
  parent: Placement,
  rect: Rect,
  transform: TransitionValue
): Placement {
  const [tx, ty, scale] = transform;
  if (tx === 0 && ty === 0 && scale === 1) return parent;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  // The node maps p to scale * p + offset in its parent's layout space.
  const ox = cx * (1 - scale) + tx;
  const oy = cy * (1 - scale) + ty;
  return {
    scale: parent.scale * scale,
    x: parent.scale * ox + parent.x,
    y: parent.scale * oy + parent.y,
  };
}

export function placeRect(rect: Rect, placement: Placement): Rect {
  if (placement === IDENTITY) return rect;
  const { scale, x, y } = placement;
  return {
    x: rect.x * scale + x,
    y: rect.y * scale + y,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}
