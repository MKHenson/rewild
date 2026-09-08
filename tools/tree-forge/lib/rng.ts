// Seeded randomness. Every number the generator draws comes from here, so a
// name plus a seed reproduces a tree byte for byte on any machine.

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A seeded stream, plus the two draws the generator actually makes from it. */
export interface Rng {
  (): number;
  range(from: number, to: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: small, fast, and good enough for placement noise. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;

  next.range = (from, to) => from + next() * (to - from);
  next.pick = (items) => items[Math.min(items.length - 1, (next() * items.length) | 0)];
  return next;
}

/** Deterministic 0..1 from a pair of integers, for per-branch constants. */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ b ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
