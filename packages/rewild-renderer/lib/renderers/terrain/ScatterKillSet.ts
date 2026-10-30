// Per-chunk kill-set: the individual scatter instances an author has plucked.
//
// The density mask handles regions — a clearing, a building site, a path — but
// it is a low-frequency field and cannot say "not *that* tree". This can, and
// it is the only part of scatter that stores anything per instance. It stays
// tiny because it only holds what was removed: a chunk nobody has plucked from
// has no blob at all.
//
// An instance is identified by the cell that produced it, not by its index in a
// list. Placement walks a jittered grid in global sample space (see
// scatterChunk), so a cell is a fixed piece of the world — which means a kill
// survives everything an index would not: sculpting the ground, re-tuning the
// layer's jitter ranges, painting density around it, or the instance list
// changing length because a neighbour appeared. The cell is stored relative to
// the chunk's own cell origin so the numbers stay small and a chunk's blob does
// not depend on where in the world it sits.
//
// A seed change is the exception, and deliberately: it re-rolls every cell's
// contents, so the kills point at different things. That is the same contract
// the height snapshots and paint masks already have with the seed.

export const SCATTER_KILL_SET_VERSION = 1;
export const SCATTER_KILL_SET_HEADER_BYTES = 8;

// A key packs the layer slot into the top 8 bits, then the chunk-relative cell
// as 12 bits of y and 12 of x (`kill_key` in crates/terrain/src/scatter.rs).
// 4096 cells across a chunk covers a footprint down to about 6cm at the current
// chunk size, far below anything the library holds.

/**
 * The killed instances of one chunk, as packed cell keys.
 */
export type ScatterKillSet = Set<number>;

// ── Persistence ──────────────────────────────────────────────────────────────
// Layout (little-endian):
//   u32 version — SCATTER_KILL_SET_VERSION; bump on any layout change
//   u32 count   — keys that follow
//   u32[count]  — packed keys, ascending so the blob is stable across saves
//
// Ascending order matters for the sync rather than the reader: an unordered set
// serialises differently every time it is rebuilt, which would push a fresh
// blob on every save even when nothing changed.

export function serializeScatterKillSet(kills: ScatterKillSet): ArrayBuffer {
  const keys = [...kills].sort((a, b) => a - b);
  const buffer = new ArrayBuffer(
    SCATTER_KILL_SET_HEADER_BYTES + keys.length * 4
  );
  const view = new DataView(buffer);
  view.setUint32(0, SCATTER_KILL_SET_VERSION, true);
  view.setUint32(4, keys.length, true);
  new Uint32Array(buffer, SCATTER_KILL_SET_HEADER_BYTES).set(keys);
  return buffer;
}

/**
 * Throws on anything malformed or not-yet-supported; callers treat a throw as
 * "no kills here" and grow the chunk in full — the same contract as
 * deserializePaintMask.
 */
export function deserializeScatterKillSet(buffer: ArrayBuffer): ScatterKillSet {
  if (buffer.byteLength < SCATTER_KILL_SET_HEADER_BYTES)
    throw new Error('Scatter kill set is smaller than its header.');

  const view = new DataView(buffer);
  const version = view.getUint32(0, true);
  const count = view.getUint32(4, true);

  if (version !== SCATTER_KILL_SET_VERSION)
    throw new Error(`Unsupported scatter kill set version ${version}.`);

  const expected = SCATTER_KILL_SET_HEADER_BYTES + count * 4;
  if (buffer.byteLength !== expected)
    throw new Error(
      `Scatter kill set is ${buffer.byteLength} bytes; expected ${expected} for ${count} keys.`
    );

  return new Set(new Uint32Array(buffer, SCATTER_KILL_SET_HEADER_BYTES, count));
}

/**
 * Async lookup for a chunk's saved kill set, injected into the TerrainRenderer
 * by the host app. Resolves null when nothing has been plucked here — the same
 * contract as PaintMaskProvider.
 */
export type ScatterKillSetProvider = (
  cx: number,
  cy: number
) => Promise<ScatterKillSet | null>;
