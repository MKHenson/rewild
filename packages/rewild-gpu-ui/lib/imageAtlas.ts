/** The width and height of one layer of the image atlas, in texels. */
export const ATLAS_SIZE = 2048;
/** The largest block in the atlas. A layer holds 4 by 4 of them. */
export const MAX_BLOCK = 512;
/** The smallest block in the atlas. */
export const MIN_BLOCK = 16;
/**
 * Texels of clear space round each image in its block. Mips of a block keep
 * a whole texel of it down to the last level, so bilinear reads stay inside.
 */
export const IMAGE_BORDER = 4;
/** Mip levels in each atlas layer: full, half and quarter size. */
export const ATLAS_MIP_LEVELS = 3;

/** A square block of an atlas layer, in texels. */
export interface AtlasBlock {
  layer: number;
  x: number;
  y: number;
  size: number;
}

/**
 * The block size for an image, with its border, or null when the image is
 * too large for the atlas and needs its own texture.
 */
export function blockSize(width: number, height: number): number | null {
  const need = Math.max(width, height) + 2 * IMAGE_BORDER;
  if (need > MAX_BLOCK) return null;
  let size = MIN_BLOCK;
  while (size < need) size *= 2;
  return size;
}

/**
 * A buddy allocator over the layers of the image atlas. Each block is a square
 * of a power of two in size, on a multiple of its size. A block splits into
 * four, and four free buddies join again into their parent, so freed space is
 * used again. A block on a multiple of its size stays on whole texels at each
 * mip level, so mips of one image do not mix with another.
 */
export class BuddyAllocator {
  /** The free blocks of each size, by key. */
  private free = new Map<number, Map<string, AtlasBlock>>();
  private _layers = 0;

  constructor() {
    for (let size = MIN_BLOCK; size <= MAX_BLOCK; size *= 2)
      this.free.set(size, new Map());
  }

  get layers(): number {
    return this._layers;
  }

  /** Adds an empty layer. */
  addLayer(): void {
    const layer = this._layers++;
    const blocks = ATLAS_SIZE / MAX_BLOCK;
    for (let y = 0; y < blocks; y++)
      for (let x = 0; x < blocks; x++)
        this.addFree({
          layer,
          x: x * MAX_BLOCK,
          y: y * MAX_BLOCK,
          size: MAX_BLOCK,
        });
  }

  /**
   * A free block of `size`, taken from the smallest free block that holds it.
   * Returns null when no layer has room. Then add a layer and try again.
   */
  allocate(size: number): AtlasBlock | null {
    let from = size;
    while (from <= MAX_BLOCK && !this.free.get(from)!.size) from *= 2;
    if (from > MAX_BLOCK) return null;
    let block = this.takeFirst(from);
    // Split down to the size. Keep the top left quarter, and free the rest.
    while (block.size > size) {
      const half = block.size / 2;
      const { layer, x, y } = block;
      this.addFree({ layer, x: x + half, y, size: half });
      this.addFree({ layer, x, y: y + half, size: half });
      this.addFree({ layer, x: x + half, y: y + half, size: half });
      block = { layer, x, y, size: half };
    }
    return block;
  }

  /** Frees a block. Four free buddies join into their parent. */
  release(block: AtlasBlock): void {
    let current = block;
    while (current.size < MAX_BLOCK) {
      const parentSize = current.size * 2;
      const px = current.x - (current.x % parentSize);
      const py = current.y - (current.y % parentSize);
      const quarters = [
        [px, py],
        [px + current.size, py],
        [px, py + current.size],
        [px + current.size, py + current.size],
      ];
      const free = this.free.get(current.size)!;
      const buddies = quarters
        .filter(([x, y]) => x !== current.x || y !== current.y)
        .map(([x, y]) => blockKey(current.layer, x, y));
      if (!buddies.every((key) => free.has(key))) break;
      for (const key of buddies) free.delete(key);
      current = { layer: current.layer, x: px, y: py, size: parentSize };
    }
    this.addFree(current);
  }

  /** The free blocks, for tests. */
  freeBlocks(): AtlasBlock[] {
    return [...this.free.values()].flatMap((blocks) => [...blocks.values()]);
  }

  private addFree(block: AtlasBlock): void {
    this.free
      .get(block.size)!
      .set(blockKey(block.layer, block.x, block.y), block);
  }

  private takeFirst(size: number): AtlasBlock {
    const blocks = this.free.get(size)!;
    const [key, block] = blocks.entries().next().value as [string, AtlasBlock];
    blocks.delete(key);
    return block;
  }
}

function blockKey(layer: number, x: number, y: number): string {
  return `${layer},${x},${y}`;
}
