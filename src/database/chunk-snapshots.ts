// Deep import: only the snapshot format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  ChunkSnapshotProvider,
  chunkSnapshotFilename,
  deserializeChunkSnapshot,
} from 'rewild-renderer/lib/renderers/terrain/ChunkSnapshot';
import { db } from './database';

// Bridges the renderer's snapshot lookup to the asset store. The read is
// OPFS-only — the cache is populated from the bucket by the existing sync()
// pull — and resolves null when the chunk has no snapshot (or the blob is
// unusable), which makes the chunk fall back to generation.
export function createChunkSnapshotProvider(
  levelId: string
): ChunkSnapshotProvider {
  return async (cx: number, cy: number) => {
    const buffer = await db.assets.read(
      levelId,
      'chunk',
      chunkSnapshotFilename(cx, cy)
    );
    if (!buffer) return null;

    try {
      return deserializeChunkSnapshot(buffer).heights;
    } catch (err) {
      console.warn(`Ignoring unusable chunk snapshot ${cx}_${cy}.bin:`, err);
      return null;
    }
  };
}
