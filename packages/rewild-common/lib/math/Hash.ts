// Integer hashes for seeded randomness that needs no generator state: the same
// inputs give the same values on any thread and in any order.

/** Scrambles a 32-bit value so every input bit affects every output bit. */
export function mixHash(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A hash of integer grid cell (x, y) under `seed`. */
export function hashCell(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x9e3779b1);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  return mixHash(h ^ (seed | 0));
}

/** The `index`-th independent value in 0..1 derived from `hash`. */
export function hash01(hash: number, index: number): number {
  return mixHash(hash + Math.imul(index | 0, 0x9e3779b1)) / 4294967296;
}
