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

/** One accent's run of cells in the atlas. */
export interface CellRange {
  offset: number;
  count: number;
}

/**
 * How a cutout image is divided: the host's own cells first, then each
 * accent's, on one square grid.
 *
 * The host's cells are the leaf grid, the clump's stamps or the crown's
 * fronds, addressed from 0. An accent's stamps follow, one whole stamp per
 * cell, in the order the config lists the accents. The grid is the smallest
 * square holding all of it, so a tree at `leafGrid` 2 with one accent stamp
 * paints a 3x3 image with four cells left blank — and every leaf cell drops
 * from a half of the edge to a third. That cost is reported, not hidden.
 */
export interface AtlasLayout {
  grid: number;
  /** The host's cells, from 0. */
  cells: number;
  /** Each accent's cells, in the config's order. */
  accents: CellRange[];
  /**
   * Width over height of every cell, the host's then the accents'. Present,
   * the cells are strips shaped like the cards that sample them — see
   * packStrips. Absent, they are the square grid.
   */
  aspects?: number[];
}

export function layoutAtlas(cells: number, accentCells: number[], aspects?: number[]): AtlasLayout {
  const accents: CellRange[] = [];
  let offset = cells;
  for (const count of accentCells) {
    accents.push({ offset, count });
    offset += count;
  }
  if (aspects && aspects.length !== offset)
    throw new Error(`A strip layout needs one aspect per cell: ${offset} cells, ${aspects.length} aspects.`);
  return { grid: Math.max(1, Math.ceil(Math.sqrt(offset))), cells, accents, ...(aspects ? { aspects } : {}) };
}

/**
 * Strips of `aspects`, packed left to right in rows of one height, at the
 * tallest height that fits the square image.
 *
 * A frond is several times longer than it is wide, and a square cell gives it
 * the texels of its length across as well — most of them blank. A strip is
 * the frond's own shape, so the same image carries it at up to the whole
 * image's height. Each strip's inside, past the gutter, is exactly its aspect,
 * so the column a card samples is the whole of it.
 */
export function packStrips(size: number, aspects: number[]): PixelRect[] {
  const g = gutterFor(size);
  const widthAt = (height: number, aspect: number) => Math.min(size, Math.round((height - 2 * g) * aspect) + 2 * g);

  const pack = (height: number): PixelRect[] | null => {
    const rects: PixelRect[] = [];
    let x = 0;
    let y = 0;
    for (const aspect of aspects) {
      const width = widthAt(height, aspect);
      if (x + width > size) {
        x = 0;
        y += height;
      }
      if (y + height > size) return null;
      rects.push({ x, y, width, height });
      x += width;
    }
    return rects;
  };

  let low = 2 * g + 1;
  let high = size;
  let best = pack(low);
  if (!best) throw new Error(`${aspects.length} strips do not fit a ${size}px image.`);

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const rects = pack(mid);
    if (rects) {
      best = rects;
      low = mid;
    } else high = mid - 1;
  }

  return best;
}

/** Every cell in texels, host's then accents', for the image writer. */
export function cellPixels(size: number, layout: AtlasLayout): PixelRect[] {
  return layout.aspects ? packStrips(size, layout.aspects) : leafCellPixels(size, layout.grid);
}

/** Every cell in UV space, inset by the gutter. */
export function cellUvs(size: number, layout: AtlasLayout): UvRect[] {
  const g = gutterFor(size);
  return cellPixels(size, layout).map((rect) => ({
    u0: (rect.x + g) / size,
    u1: (rect.x + rect.width - g) / size,
    v0: (rect.y + g) / size,
    v1: (rect.y + rect.height - g) / size,
  }));
}

/** Texels along a cell's height inside its gutter: what a stamp is fitted to. */
export function cellInnerPx(size: number, layout: AtlasLayout): number {
  if (layout.aspects) return packStrips(size, layout.aspects)[0].height - 2 * gutterFor(size);
  return size / layout.grid - 2 * gutterFor(size);
}

/** The cells one accent's cards address. */
export function accentCells(size: number, layout: AtlasLayout, index: number): UvRect[] {
  const range = layout.accents[index];
  return cellUvs(size, layout).slice(range.offset, range.offset + range.count);
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

/**
 * The centred column of a cell that a card of `aspect` samples: as wide as
 * the cell is tall, times the aspect, and never wider than the cell.
 *
 * A frond is three times longer than it is wide, and a square cell that held
 * it stretched would give it three times the texels across that it has along.
 * The card samples this column instead, so a stamp lands at its own aspect and
 * a generated frond is painted at the same. The rest of the cell is blank.
 */
export function columnOf(rect: UvRect, aspect: number): UvRect {
  const width = Math.min(rect.u1 - rect.u0, (rect.v1 - rect.v0) * aspect);
  const centre = (rect.u0 + rect.u1) / 2;
  return { u0: centre - width / 2, u1: centre + width / 2, v0: rect.v0, v1: rect.v1 };
}

/** The same column in texels, for the image writer. */
export function columnPixels(rect: PixelRect, aspect: number): PixelRect {
  const width = Math.min(rect.width, Math.round(rect.height * aspect));
  return { x: rect.x + Math.floor((rect.width - width) / 2), y: rect.y, width, height: rect.height };
}
