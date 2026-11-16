import { resolveLength } from './style';
import { Rect, UINode } from './UINode';

/**
 * Places each node in surface CSS pixels. An absolute node is placed in the
 * box inside its parent's border, as in CSS. Until flex layout, a relative
 * node sits at the top left of that box and fills its width.
 */
export function layoutTree(root: UINode, width: number, height: number): void {
  root.rect = { x: 0, y: 0, width, height };
  layoutChildren(root);
}

function layoutChildren(node: UINode): void {
  const container = innerBox(node);
  for (const child of node.children) {
    child.rect =
      child.style.position === 'absolute'
        ? placeAbsolute(child, container)
        : placeRelative(child, container);
    layoutChildren(child);
  }
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

function placeAbsolute(node: UINode, container: Rect): Rect {
  const { style } = node;
  const [x, width] = placeAxis(
    resolveLength(style.left, container.width),
    resolveLength(style.right, container.width),
    resolveLength(style.width, container.width),
    container.width
  );
  const [y, height] = placeAxis(
    resolveLength(style.top, container.height),
    resolveLength(style.bottom, container.height),
    resolveLength(style.height, container.height),
    container.height
  );
  return { x: container.x + x, y: container.y + y, width, height };
}

function placeAxis(
  start: number | undefined,
  end: number | undefined,
  size: number | undefined,
  space: number
): [number, number] {
  const resolved =
    size ??
    (start !== undefined && end !== undefined ? space - start - end : 0);
  const length = Math.max(0, resolved);
  if (start !== undefined) return [start, length];
  if (end !== undefined) return [space - end - length, length];
  return [0, length];
}

function placeRelative(node: UINode, container: Rect): Rect {
  const { style } = node;
  const width = resolveLength(style.width, container.width) ?? container.width;
  const height = resolveLength(style.height, container.height) ?? 0;
  const left = resolveLength(style.left, container.width);
  const right = resolveLength(style.right, container.width);
  const top = resolveLength(style.top, container.height);
  const bottom = resolveLength(style.bottom, container.height);
  return {
    x: container.x + (left ?? (right !== undefined ? -right : 0)),
    y: container.y + (top ?? (bottom !== undefined ? -bottom : 0)),
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}
