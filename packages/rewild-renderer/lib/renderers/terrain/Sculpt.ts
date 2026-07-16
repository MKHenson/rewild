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

export type SculptBrushType = 'raise' | 'lower' | 'smooth' | 'flatten';

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
   * smooth/flatten — blend fraction (0..1) toward the smoothed/target height.
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
  getHeights(cx: number, cy: number): Float32Array | null;
}

export interface TouchedChunk {
  cx: number;
  cy: number;
  heights: Float32Array;
}

// Smoothstep falloff: 1 at the brush centre, 0 at the radius.
function falloff(dist: number, radius: number): number {
  const t = dist / radius;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Applies one brush stamp to every chunk the brush overlaps and returns the
 * chunks whose heights changed. Pure with respect to its inputs: all terrain
 * access goes through `source`, so it is trivially testable and shared by any
 * future runtime sculpting UX.
 */
export function applySculptStamp(
  source: SculptHeightSource,
  stamp: SculptStamp
): TouchedChunk[] {
  const chunkSize = source.chunkSize;
  const span = chunkSize - 1;
  const half = span / 2;
  const { centerX, centerZ, radius, type } = stamp;

  if (radius <= 0 || stamp.amount === 0) return [];
  if (type === 'flatten' && stamp.target === undefined) return [];

  // World-integer sample range covered by the brush, padded by one sample for
  // smooth (its 3x3 average reads one ring beyond the edited region).
  const x0 = Math.ceil(centerX - radius);
  const x1 = Math.floor(centerX + radius);
  const z0 = Math.ceil(centerZ - radius);
  const z1 = Math.floor(centerZ + radius);
  if (x1 < x0 || z1 < z0) return [];

  // Smooth needs its kernel's worth of samples beyond the edited region so
  // every averaged neighbourhood exists in the patch.
  const kernel =
    type === 'smooth' ? Math.max(1, Math.floor(stamp.smoothKernel ?? 1)) : 0;
  const margin = kernel;
  const gx0 = x0 - margin;
  const gz0 = z0 - margin;
  const pw = x1 + margin - gx0 + 1;
  const ph = z1 + margin - gz0 + 1;

  // Chunk heightfields resolved once per stamp.
  const chunkCache = new Map<string, Float32Array | null>();
  const resolve = (cx: number, cy: number): Float32Array | null => {
    const key = `${cx},${cy}`;
    let heights = chunkCache.get(key);
    if (heights === undefined) {
      heights = source.getHeights(cx, cy);
      chunkCache.set(key, heights);
    }
    return heights;
  };

  // Gather the brush region into a world-space patch. Reading needs ANY owning
  // chunk (owners' copies of a shared sample are identical), but a sample is
  // editable only when EVERY owner resolved — editing one side of a shared
  // edge while the other owner is unavailable would persist a seam.
  const patch = new Float32Array(pw * ph);
  const readable = new Uint8Array(pw * ph);
  const editable = new Uint8Array(pw * ph);
  for (let r = 0; r < ph; r++) {
    const wz = gz0 + r;
    const cyMin = Math.ceil((wz - half) / span);
    const cyMax = Math.floor((wz + half) / span);
    for (let c = 0; c < pw; c++) {
      const wx = gx0 + c;
      const cxMin = Math.ceil((wx - half) / span);
      const cxMax = Math.floor((wx + half) / span);
      let read = false;
      let allOwners = true;
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const heights = resolve(cx, cy);
          if (!heights) {
            allOwners = false;
            continue;
          }
          if (!read) {
            const sx = wx - cx * span + half;
            const sy = cy * span + half - wz;
            patch[r * pw + c] = heights[sy * chunkSize + sx];
            read = true;
          }
        }
      }
      readable[r * pw + c] = read ? 1 : 0;
      editable[r * pw + c] = read && allOwners ? 1 : 0;
    }
  }

  // Smooth reads neighbours from the pre-stamp state so the result does not
  // depend on sample iteration order.
  const src = type === 'smooth' ? patch.slice() : patch;

  const touched = new Map<string, TouchedChunk>();
  const radiusSq = radius * radius;

  for (let wz = z0; wz <= z1; wz++) {
    const r = wz - gz0;
    for (let wx = x0; wx <= x1; wx++) {
      const c = wx - gx0;
      const i = r * pw + c;
      if (!editable[i]) continue;

      const dx = wx - centerX;
      const dz = wz - centerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;

      const f = falloff(Math.sqrt(distSq), radius);
      const v = patch[i];
      let next = v;

      switch (type) {
        case 'raise':
          next = v + stamp.amount * f;
          break;
        case 'lower':
          next = v - stamp.amount * f;
          break;
        case 'flatten': {
          const blend = Math.min(1, Math.max(0, stamp.amount * f));
          next = v + (stamp.target! - v) * blend;
          break;
        }
        case 'smooth': {
          // Box average of the valid (2*kernel+1)² neighbourhood (margin
          // guarantees it exists in the patch; chunk-missing samples are
          // excluded). Read from the pre-stamp copy so the result is
          // order-independent.
          let sum = 0;
          let count = 0;
          for (let nr = r - kernel; nr <= r + kernel; nr++) {
            for (let nc = c - kernel; nc <= c + kernel; nc++) {
              const ni = nr * pw + nc;
              if (!readable[ni]) continue;
              sum += src[ni];
              count++;
            }
          }
          const blend = Math.min(1, Math.max(0, stamp.amount * f));
          next = v + (sum / count - v) * blend;
          break;
        }
      }

      if (next === v) continue;
      patch[i] = next;

      // Scatter to every chunk that owns this sample so shared edge vertices
      // stay byte-identical across the border.
      const cxMin = Math.ceil((wx - half) / span);
      const cxMax = Math.floor((wx + half) / span);
      const cyMin = Math.ceil((wz - half) / span);
      const cyMax = Math.floor((wz + half) / span);
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const heights = resolve(cx, cy);
          if (!heights) continue;
          const sx = wx - cx * span + half;
          const sy = cy * span + half - wz;
          heights[sy * chunkSize + sx] = next;
          const key = `${cx},${cy}`;
          if (!touched.has(key)) touched.set(key, { cx, cy, heights });
        }
      }
    }
  }

  return [...touched.values()];
}
