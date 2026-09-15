// The two textures' layouts, shared by the UV writer and the image writer so
// the two cannot drift.
//
// Bark and leaves are separate images because they are already separate
// materials: a tree ships as two primitives and the scatter path builds a pass
// per primitive, so a second image costs one decode at load and nothing per
// frame. One shared atlas cost a gutter around the bark, a mip chain that
// averaged bark into leaf alpha, and half the texels each.
//
// Bark owns its whole image and wraps on both axes, so it has no regions and
// needs no gutter. Leaves are a square grid of cluster cells on alpha, `grid`
// cells along each edge. The count is decided by whoever paints the cells —
// see leafGrid in sources.ts — and the mesh has to be handed the same number,
// or its cards address cells that were never drawn.

// Texels kept clear at every cell edge. Bilinear filtering reaches half a texel
// past a UV and the mip chain reaches much further, so without this a cell
// bleeds into the one beside it.
const GUTTER_TEXELS = 8;

export function gutterFor(size: number): number {
  return Math.max(2, Math.round((size / 1024) * GUTTER_TEXELS));
}

/** A rectangle in UV space. */
export interface UvRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** A rectangle in texels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where cell `k` starts, in texels.
 *
 * Whole texels, because a grid need not divide the image. A leaf grid is 1, 2
 * or 4 and always did, but a clump's is the smallest square holding its stamps,
 * so 3 and 5 are ordinary — and `2048 / 3` lands a rect on a fractional index,
 * where every write to the canvas is silently dropped.
 *
 * Both the UVs and the image writer are derived from this one function, so a
 * rounded boundary cannot move one without moving the other.
 */
function edgeAt(size: number, grid: number, k: number): number {
  return Math.round((k * size) / grid);
}

/** The leaf cells in UV space, inset by the gutter. */
export function leafCells(size: number, grid: number): UvRect[] {
  const g = gutterFor(size);
  const cells: UvRect[] = [];

  for (let cy = 0; cy < grid; cy++)
    for (let cx = 0; cx < grid; cx++)
      cells.push({
        u0: (edgeAt(size, grid, cx) + g) / size,
        u1: (edgeAt(size, grid, cx + 1) - g) / size,
        v0: (edgeAt(size, grid, cy) + g) / size,
        v1: (edgeAt(size, grid, cy + 1) - g) / size,
      });

  return cells;
}

/** The same cells in texels, for the image writer. */
export function leafCellPixels(size: number, grid: number): PixelRect[] {
  const cells: PixelRect[] = [];

  for (let cy = 0; cy < grid; cy++)
    for (let cx = 0; cx < grid; cx++) {
      const x = edgeAt(size, grid, cx);
      const y = edgeAt(size, grid, cy);
      cells.push({
        x,
        y,
        width: edgeAt(size, grid, cx + 1) - x,
        height: edgeAt(size, grid, cy + 1) - y,
      });
    }

  return cells;
}

/** A cell with its gutter taken off: the part a card's UVs actually address. */
export function insetRect(rect: PixelRect, gutter: number): PixelRect {
  return { x: rect.x + gutter, y: rect.y + gutter, width: rect.width - 2 * gutter, height: rect.height - 2 * gutter };
}
