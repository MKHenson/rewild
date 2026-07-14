// Chunk snapshot binary format (issue #173).
//
// A snapshot stores a chunk's complete LOD-0 heightfield so an edited chunk is
// fetched-and-meshed instead of regenerated ("saved ⇒ not generated"). It is a
// whole, frozen chunk: internally consistent and immune to later changes in
// the generation algorithm or biome tuning.
//
// Layout (little-endian):
//   u32 version     — CHUNK_SNAPSHOT_VERSION; bump on any layout change
//   u32 width       — samples per row (LOD-0, e.g. 241)
//   u32 height      — rows
//   u32 flags       — bit 0: body is compressed (reserved — readers reject it
//                     until compression lands; raw ships first)
//   f32[width*height] heights in absolute world meters, row-major
//
// The 16-byte header keeps the f32 body 4-byte aligned so it can be viewed
// in-place without copying.

export const CHUNK_SNAPSHOT_VERSION = 1;
export const CHUNK_SNAPSHOT_HEADER_BYTES = 16;
export const CHUNK_SNAPSHOT_FLAG_COMPRESSED = 1;

export interface ChunkSnapshot {
  version: number;
  width: number;
  height: number;
  compressed: boolean;
  heights: Float32Array;
}

// Storage name on the asset path: levels/{levelId}/chunk/{cx}_{cy}.bin, where
// cx/cy are the integer chunk coordinates (not world positions).
export function chunkSnapshotFilename(cx: number, cy: number): string {
  return `${cx}_${cy}.bin`;
}

export function serializeChunkSnapshot(
  heights: Float32Array,
  width: number,
  height: number
): ArrayBuffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error('Chunk snapshot dimensions must be positive integers.');
  if (heights.length !== width * height)
    throw new Error(
      `Chunk snapshot heights length ${heights.length} does not match ${width}x${height}.`
    );

  const buffer = new ArrayBuffer(CHUNK_SNAPSHOT_HEADER_BYTES + heights.length * 4);
  const view = new DataView(buffer);
  view.setUint32(0, CHUNK_SNAPSHOT_VERSION, true);
  view.setUint32(4, width, true);
  view.setUint32(8, height, true);
  view.setUint32(12, 0, true); // flags — raw, uncompressed
  new Float32Array(buffer, CHUNK_SNAPSHOT_HEADER_BYTES).set(heights);
  return buffer;
}

// Throws on anything malformed or not-yet-supported; callers treat a throw as
// "no usable snapshot" and fall back to generation.
export function deserializeChunkSnapshot(buffer: ArrayBuffer): ChunkSnapshot {
  if (buffer.byteLength < CHUNK_SNAPSHOT_HEADER_BYTES)
    throw new Error('Chunk snapshot is smaller than its header.');

  const view = new DataView(buffer);
  const version = view.getUint32(0, true);
  const width = view.getUint32(4, true);
  const height = view.getUint32(8, true);
  const flags = view.getUint32(12, true);

  if (version !== CHUNK_SNAPSHOT_VERSION)
    throw new Error(`Unsupported chunk snapshot version ${version}.`);
  if ((flags & CHUNK_SNAPSHOT_FLAG_COMPRESSED) !== 0)
    throw new Error('Compressed chunk snapshots are not supported yet.');
  if (width <= 0 || height <= 0)
    throw new Error(`Invalid chunk snapshot dimensions ${width}x${height}.`);
  if (buffer.byteLength !== CHUNK_SNAPSHOT_HEADER_BYTES + width * height * 4)
    throw new Error(
      `Chunk snapshot body is ${buffer.byteLength - CHUNK_SNAPSHOT_HEADER_BYTES} bytes; expected ${width * height * 4}.`
    );

  return {
    version,
    width,
    height,
    compressed: false,
    heights: new Float32Array(buffer, CHUNK_SNAPSHOT_HEADER_BYTES, width * height),
  };
}

// Async lookup for a chunk's saved snapshot heights, injected into the
// TerrainRenderer by the host app (the renderer package cannot depend on the
// app's asset store). Resolves null when the chunk has no snapshot.
export type ChunkSnapshotProvider = (
  cx: number,
  cy: number
) => Promise<Float32Array | null>;
