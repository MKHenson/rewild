// The texture template's layout, shared by the UV writer and the image writer
// so the two cannot drift.
//
// Top half is bark. Bottom half is a 4x2 grid of leaf-cluster cells on alpha,
// which is what makes the cells square at any power-of-two size.

export const LEAF_COLS = 4;
export const LEAF_ROWS = 2;
export const LEAF_VARIANTS = LEAF_COLS * LEAF_ROWS;

// Texels kept clear at every region edge. Bilinear filtering reaches half a
// texel past a UV and the mip chain reaches much further, so without this the
// bark bleeds into the leaf alpha the moment the tree is a few metres away.
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

export interface AtlasRegions {
  gutter: number;
  bark: UvRect;
  leaves: UvRect[];
}

export function atlasRegions(size: number): AtlasRegions {
  const g = gutterFor(size) / size;

  const leaves: UvRect[] = [];
  for (let cy = 0; cy < LEAF_ROWS; cy++)
    for (let cx = 0; cx < LEAF_COLS; cx++)
      leaves.push({
        u0: cx / LEAF_COLS + g,
        u1: (cx + 1) / LEAF_COLS - g,
        v0: 0.5 + (cy / LEAF_ROWS) * 0.5 + g,
        v1: 0.5 + ((cy + 1) / LEAF_ROWS) * 0.5 - g,
      });

  // Bark spans the full width so length tiles under a REPEAT sampler with no
  // seam. The band is inset in v only, and is authored periodic across itself
  // so the ring closes without one either.
  return { gutter: g, bark: { u0: 0, u1: 1, v0: g, v1: 0.5 - g }, leaves };
}

/** A rectangle in texels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasPixels {
  bark: PixelRect;
  leaves: PixelRect[];
}

/** Pixel bounds of the same regions, for the image writer. */
export function atlasPixels(size: number): AtlasPixels {
  const width = size / LEAF_COLS;
  const height = size / 2 / LEAF_ROWS;

  const leaves: PixelRect[] = [];
  for (let cy = 0; cy < LEAF_ROWS; cy++)
    for (let cx = 0; cx < LEAF_COLS; cx++)
      leaves.push({ x: cx * width, y: size / 2 + cy * height, width, height });

  return { bark: { x: 0, y: 0, width: size, height: size / 2 }, leaves };
}
