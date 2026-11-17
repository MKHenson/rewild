import { innerBox } from './layout';
import { fitRadii, intersect } from './stream';
import { cornerRadii } from './style';
import type { Rect, UINode } from './UINode';

type Radii = [number, number, number, number];

/**
 * The topmost node at a point in surface CSS pixels, or null. It tests the
 * same shapes the stream draws: each box with its corner radius, inside the
 * clip of its `overflow: 'hidden'` parents. Layout must have run.
 */
export function hitTest(root: UINode, x: number, y: number): UINode | null {
  return hitNode(root, x, y, null, null);
}

function hitNode(
  node: UINode,
  x: number,
  y: number,
  clip: Rect | null,
  clipRadii: Radii | null
): UINode | null {
  const { style, rect } = node;
  if (style.display === 'none') return null;
  const radii = fitRadii(cornerRadii(style.borderRadius), rect);

  let childClip = clip;
  let childRadii = clipRadii;
  if (style.overflow === 'hidden') {
    // Nested clips keep only the innermost corner radii, as the stream does.
    const borderWidth = style.borderWidth ?? 0;
    childClip = clip ? intersect(clip, innerBox(node)) : innerBox(node);
    childRadii = radii.map((r) => Math.max(0, r - borderWidth)) as Radii;
  }
  if (!childClip || insideRounded(x, y, childClip, childRadii!))
    for (let i = node.children.length - 1; i >= 0; i--) {
      const hit = hitNode(node.children[i], x, y, childClip, childRadii);
      if (hit) return hit;
    }

  if (style.pointerEvents === 'none') return null;
  if (clip && !insideRounded(x, y, clip, clipRadii!)) return null;
  return insideRounded(x, y, rect, radii) ? node : null;
}

/**
 * True when the point is inside the rect with circular corners of the given
 * radii: top left, top right, bottom right, bottom left. The left and top
 * edges are inside and the right and bottom edges are not.
 */
export function insideRounded(
  x: number,
  y: number,
  rect: Rect,
  radii: Radii
): boolean {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (x < rect.x || y < rect.y || x >= right || y >= bottom) return false;
  const [tl, tr, br, bl] = radii;
  if (x < rect.x + tl && y < rect.y + tl)
    return inCircle(x, y, rect.x + tl, rect.y + tl, tl);
  if (x > right - tr && y < rect.y + tr)
    return inCircle(x, y, right - tr, rect.y + tr, tr);
  if (x > right - br && y > bottom - br)
    return inCircle(x, y, right - br, bottom - br, br);
  if (x < rect.x + bl && y > bottom - bl)
    return inCircle(x, y, rect.x + bl, bottom - bl, bl);
  return true;
}

function inCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
