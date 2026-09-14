// Deep import: only the kill-set format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  ScatterKillSet,
  ScatterKillSetProvider,
  deserializeScatterKillSet,
  serializeScatterKillSet,
} from 'rewild-renderer/lib/renderers/terrain/ScatterKillSet';
import { db } from './database';

// Storage name on the asset path, beside the chunk's height snapshot, biome
// mask and scatter density: levels/{levelId}/chunk/{cx}_{cy}.kills.bin.
//
// Its own blob for the same reason the others have theirs — a chunk can have a
// tree plucked from it without ever being sculpted or painted — and because it
// is the sparsest of the four: usually absent, and a few bytes when present.
export function scatterKillsFilename(cx: number, cy: number): string {
  return `${cx}_${cy}.kills.bin`;
}

// Bridges the renderer's kill-set lookup to the asset store. OPFS-only — the
// cache is populated from the bucket by the existing sync() pull — and resolves
// null when nothing has been plucked here (or the blob is unusable), which
// grows the chunk in full.
export function createScatterKillProvider(
  levelId: string
): ScatterKillSetProvider {
  return async (cx: number, cy: number) => {
    const buffer = await db.assets.read(
      levelId,
      'chunk',
      scatterKillsFilename(cx, cy)
    );
    if (!buffer) return null;

    try {
      return deserializeScatterKillSet(buffer);
    } catch (err) {
      console.warn(
        `Ignoring unusable scatter kill set ${cx}_${cy}.kills.bin:`,
        err
      );
      return null;
    }
  };
}

// Persists a chunk's kill set on the asset path, with the same local-first
// semantics as writeScatterMask. Returns the asset id.
export function writeScatterKills(
  levelId: string,
  cx: number,
  cy: number,
  kills: ScatterKillSet
): Promise<string> {
  return db.assets.write(
    levelId,
    'chunk',
    scatterKillsFilename(cx, cy),
    serializeScatterKillSet(kills)
  );
}
