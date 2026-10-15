// Deep import: only the snapshot format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  ChunkSnapshotProvider,
  chunkSnapshotFilename,
  deserializeChunkSnapshot,
  serializeChunkSnapshot,
} from 'rewild-renderer/lib/renderers/terrain/ChunkSnapshot';
import { db } from './database';
import type { AssetReader, LevelRef } from './local-asset-store';

// Bridges the renderer's snapshot lookup to the level's files. Resolves null
// when the chunk has no snapshot (or the blob is unusable), which makes the
// chunk fall back to generation.
export function createChunkSnapshotProvider(read: AssetReader): ChunkSnapshotProvider {
  return async (cx: number, cy: number) => {
    const buffer = await read('chunk', chunkSnapshotFilename(cx, cy));
    if (!buffer) return null;

    try {
      return deserializeChunkSnapshot(buffer).heights;
    } catch (err) {
      console.warn(`Ignoring unusable chunk snapshot ${cx}_${cy}.bin:`, err);
      return null;
    }
  };
}

// Persists a chunk's full LOD-0 heightfield as a snapshot on the asset path.
// Local-first: the blob lands in OPFS and the metadata row is (re)marked dirty,
// so the next authenticated sync pushes it to the bucket — re-writes overwrite
// the same OPFS file and bucket object (latest edit wins). Returns the asset id.
export function writeChunkSnapshot(
  level: LevelRef,
  cx: number,
  cy: number,
  heights: Float32Array,
  size: number
): Promise<string> {
  return db.assets.write(
    { ...level, assetType: 'chunk', filename: chunkSnapshotFilename(cx, cy) },
    serializeChunkSnapshot(heights, size, size)
  );
}
