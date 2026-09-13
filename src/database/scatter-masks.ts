// Deep import: only the mask format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  PaintMask,
  PaintMaskProvider,
  deserializePaintMask,
  serializePaintMask,
} from 'rewild-renderer/lib/renderers/terrain/PaintMask';
import { db } from './database';

// Storage name on the asset path, beside the chunk's height snapshot and biome
// mask: levels/{levelId}/chunk/{cx}_{cy}.scatter.bin.
//
// Its own blob for the same reason the biome mask has one: a chunk can be
// planted without ever being sculpted or repainted, and three files means none
// of the three formats has to version for another's sake.
export function scatterMaskFilename(cx: number, cy: number): string {
  return `${cx}_${cy}.scatter.bin`;
}

// Bridges the renderer's mask lookup to the asset store. OPFS-only — the cache
// is populated from the bucket by the existing sync() pull — and resolves null
// when the chunk has never been planted (or the blob is unusable), which leaves
// the chunk scattering from its biome rules alone.
export function createScatterMaskProvider(levelId: string): PaintMaskProvider {
  return async (cx: number, cy: number) => {
    const buffer = await db.assets.read(
      levelId,
      'chunk',
      scatterMaskFilename(cx, cy)
    );
    if (!buffer) return null;

    try {
      return deserializePaintMask(buffer);
    } catch (err) {
      console.warn(
        `Ignoring unusable scatter mask ${cx}_${cy}.scatter.bin:`,
        err
      );
      return null;
    }
  };
}

// Persists a chunk's painted scatter density on the asset path, with the same
// local-first semantics as writeBiomeMask. Returns the asset id.
export function writeScatterMask(
  levelId: string,
  cx: number,
  cy: number,
  mask: PaintMask
): Promise<string> {
  return db.assets.write(
    levelId,
    'chunk',
    scatterMaskFilename(cx, cy),
    serializePaintMask(mask)
  );
}
