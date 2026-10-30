// Terrain sculpting (issue #175) — the pure height-field editing core.
//
// A sculpt stroke is a sequence of *stamps*. Each stamp edits every LOD-0
// height sample within the brush radius, working in world space so a brush
// that straddles a chunk border edits every overlapped chunk in one pass.
// Samples shared by adjacent chunks (their common edge vertices) are written
// with identical values, which is what keeps borders seam-free.
//
// Coordinate model (matches MeshGenerator/TerrainChunk):
//   span = chunkSize - 1 (world units per chunk, e.g. 240)
//   chunk (cx, cy) sample (sx, sy) sits at world
//     x = cx * span + sx - span / 2
//     z = cy * span + span / 2 - sy
//   heights index = sy * chunkSize + sx
// World samples therefore lie on the integer grid, and a sample at world
// (wx, wz) belongs to every chunk with |wx - cx*span| <= span/2 and
// |wz - cy*span| <= span/2 — one chunk in the interior, two on an edge,
// four on a corner.

import { sculptStamp } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { HeightPatch } from './HeightPatch';

export type SculptBrushType =
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flatten'
  | 'reset';

export interface SculptStamp {
  type: SculptBrushType;
  /** Brush centre in world coordinates. */
  centerX: number;
  centerZ: number;
  /** Brush radius in world units. */
  radius: number;
  /**
   * Stamp intensity, already scaled by the caller (e.g. by elapsed time):
   * raise/lower — meters added/removed at the brush centre;
   * smooth/flatten/reset — blend fraction (0..1) toward the smoothed, target
   * or generated height.
   */
  amount: number;
  /** Flatten only: the world height to move samples toward. */
  target?: number;
  /**
   * Smooth only: half-width (in samples) of the box-average kernel. A single
   * LOD-0 sample spans one world unit, so a 3x3 kernel (1) only removes
   * unit-scale roughness — invisible against a hand-sculpted hill. Scale this
   * with the brush radius so smoothing works at the size the user is painting.
   * Defaults to 1.
   */
  smoothKernel?: number;
}

/**
 * Supplies per-chunk LOD-0 heightfields to a stamp. `getHeights` returns the
 * chunk's mutable heights — edits are written back into the same array — or
 * null when the chunk cannot be edited right now (its heights are still
 * resolving); such chunks are skipped and excluded from the touched set.
 */
export interface SculptHeightSource {
  /** LOD-0 samples per chunk side (e.g. 241). */
  chunkSize: number;
  /**
   * World units per sample step (TERRAIN_METERS_PER_SAMPLE). The stamp's world
   * coordinates are divided by this so all the integer-sample math below runs
   * in sample space, where a chunk spans exactly (chunkSize - 1). Defaults to 1
   * (the legacy 1 unit/sample scale) when omitted.
   */
  metersPerSample?: number;
  getHeights(cx: number, cy: number): Float32Array | null;
  /** Reset only: the chunk's generated heights, or null while they are not
   *  known. A sample without them is left alone. */
  getBaseline?(cx: number, cy: number): Float32Array | null;
}

export interface TouchedChunk {
  cx: number;
  cy: number;
  heights: Float32Array;
}

/**
 * Applies one brush stamp to every chunk the brush overlaps and returns the
 * chunks whose heights changed. All terrain access goes through `source`, and
 * the stamp itself runs in Rust (`terrain::edit::sculpt`).
 */
export function applySculptStamp(
  source: SculptHeightSource,
  stamp: SculptStamp
): TouchedChunk[] {
  const { type } = stamp;

  // Work in sample space: 1 unit == 1 sample, chunk span == chunkSize - 1,
  // independent of world scale.
  const mps = source.metersPerSample ?? 1;
  const centerX = stamp.centerX / mps;
  const centerZ = stamp.centerZ / mps;
  const radius = stamp.radius / mps;

  if (radius <= 0 || stamp.amount === 0) return [];
  if (type === 'flatten' && stamp.target === undefined) return [];

  const x0 = Math.ceil(centerX - radius);
  const x1 = Math.floor(centerX + radius);
  const z0 = Math.ceil(centerZ - radius);
  const z1 = Math.floor(centerZ + radius);
  if (x1 < x0 || z1 < z0) return [];

  // Smooth averages a kernel's worth of samples beyond the brush.
  const kernel =
    type === 'smooth' ? Math.max(1, Math.floor(stamp.smoothKernel ?? 1)) : 0;
  const patch = new HeightPatch(
    source,
    x0 - kernel,
    z0 - kernel,
    x1 + kernel,
    z1 + kernel
  );
  const baseline =
    type === 'reset'
      ? patch.plane((cx, cy) => source.getBaseline?.(cx, cy) ?? null)
      : new Float32Array(0);
  return patch.commit(
    sculptStamp(
      ...patch.args(),
      baseline,
      type,
      stamp.centerX,
      stamp.centerZ,
      stamp.radius,
      stamp.amount,
      stamp.target ?? NaN,
      kernel
    )
  );
}
