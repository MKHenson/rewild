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

// Bits per cell axis in a packed key. 4096 cells across a chunk covers a
// footprint down to about 6cm at the current chunk size — far below anything
// the library holds — and leaves 8 bits for the layer slot in one u32.
const CELL_BITS = 12;
const CELL_MAX = (1 << CELL_BITS) - 1;
const SLOT_MAX = 255;

/** Cells per chunk axis a key can address. */
export const SCATTER_KILL_CELL_LIMIT = CELL_MAX + 1;

/**
 * The killed instances of one chunk, as packed cell keys.
 */
export type ScatterKillSet = Set<number>;

/**
 * Packs (layer slot, chunk-relative cell) into one u32 key.
 *
 * Throws rather than returning a sentinel: every value of the packing is a
 * valid key, so there is no spare bit pattern to mean "unaddressable", and a
 * caller that silently dropped one would leave an instance that cannot be
 * plucked with no way to tell. scatterChunk checks the bound per layer up
 * front, so nothing reaches this with an out-of-range cell.
 */
export function scatterKillKey(
  slot: number,
  relCellX: number,
  relCellY: number
): number {
  if (slot < 0 || slot > SLOT_MAX)
    throw new Error(`Scatter kill slot ${slot} is outside 0..${SLOT_MAX}.`);
  if (
    relCellX < 0 ||
    relCellX > CELL_MAX ||
    relCellY < 0 ||
    relCellY > CELL_MAX
  )
    throw new Error(
      `Scatter kill cell (${relCellX}, ${relCellY}) is outside 0..${CELL_MAX}.`
    );
  return ((slot << 24) | (relCellY << CELL_BITS) | relCellX) >>> 0;
}

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
