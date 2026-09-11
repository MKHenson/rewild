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

/** The leaf cells in UV space, inset by the gutter. */
export function leafCells(size: number, grid: number): UvRect[] {
  const g = gutterFor(size) / size;
  const cells: UvRect[] = [];

  for (let cy = 0; cy < grid; cy++)
    for (let cx = 0; cx < grid; cx++)
      cells.push({
        u0: cx / grid + g,
        u1: (cx + 1) / grid - g,
        v0: cy / grid + g,
        v1: (cy + 1) / grid - g,
      });

  return cells;
}

/** The same cells in texels, for the image writer. */
export function leafCellPixels(size: number, grid: number): PixelRect[] {
  const edge = size / grid;
  const cells: PixelRect[] = [];

  for (let cy = 0; cy < grid; cy++)
    for (let cx = 0; cx < grid; cx++)
      cells.push({ x: cx * edge, y: cy * edge, width: edge, height: edge });

  return cells;
}

/** A cell with its gutter taken off: the part a card's UVs actually address. */
export function insetRect(rect: PixelRect, gutter: number): PixelRect {
  return { x: rect.x + gutter, y: rect.y + gutter, width: rect.width - 2 * gutter, height: rect.height - 2 * gutter };
}
