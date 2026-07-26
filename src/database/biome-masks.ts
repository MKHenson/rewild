// Deep import: only the mask format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  PaintMask,
  PaintMaskProvider,
  deserializePaintMask,
  serializePaintMask,
} from 'rewild-renderer/lib/renderers/terrain/PaintMask';
import { db } from './database';

// Storage name on the asset path, alongside the chunk's height snapshot:
// levels/{levelId}/chunk/{cx}_{cy}.biome.bin.
//
// A separate blob rather than a field in the height snapshot, deliberately: the
// snapshot's contract is "a whole, frozen heightfield", and a chunk can be
// painted without ever being sculpted (and vice versa). Two files means either
// can exist alone, and neither format has to grow a version for the other's
// sake.
export function biomeMaskFilename(cx: number, cy: number): string {
  return `${cx}_${cy}.biome.bin`;
}

// Bridges the renderer's mask lookup to the asset store. OPFS-only — the cache
// is populated from the bucket by the existing sync() pull — and resolves null
// when the chunk has never been painted (or the blob is unusable), which makes
// the chunk surface from pure climate.
export function createBiomeMaskProvider(levelId: string): PaintMaskProvider {
  return async (cx: number, cy: number) => {
    const buffer = await db.assets.read(
      levelId,
      'chunk',
      biomeMaskFilename(cx, cy)
    );
    if (!buffer) return null;

    try {
      return deserializePaintMask(buffer);
    } catch (err) {
      console.warn(`Ignoring unusable biome mask ${cx}_${cy}.biome.bin:`, err);
      return null;
    }
  };
}

// Persists a chunk's painted biome mask on the asset path. Local-first with the
// same semantics as writeChunkSnapshot: the blob lands in OPFS and the metadata
// row is (re)marked dirty, so the next authenticated sync pushes it and
// re-writes overwrite in place. Returns the asset id.
export function writeBiomeMask(
  levelId: string,
  cx: number,
  cy: number,
  mask: PaintMask
): Promise<string> {
  return db.assets.write(
    levelId,
    'chunk',
    biomeMaskFilename(cx, cy),
    serializePaintMask(mask)
  );
}
