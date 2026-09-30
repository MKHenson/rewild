// Deep import: only the record format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import type { WaterBody } from 'rewild-renderer/lib/renderers/terrain/Lakes';
import {
  WaterBodyProvider,
  deserializeWaterBodies,
  serializeWaterBodies,
} from 'rewild-renderer/lib/renderers/terrain/WaterBodies';
import { db } from './database';

// One blob per level beside the chunk edits it describes, so clearing a level's
// chunks clears it too: levels/{levelId}/chunk/water-bodies.json.
export const WATER_BODIES_FILENAME = 'water-bodies.json';

// OPFS-only, like the chunk providers. Resolves no records when none were
// saved or the blob is unusable.
export function createWaterBodyProvider(levelId: string): WaterBodyProvider {
  return async () => {
    const buffer = await db.assets.read(
      levelId,
      'chunk',
      WATER_BODIES_FILENAME
    );
    if (!buffer) return [];

    try {
      return deserializeWaterBodies(buffer);
    } catch (err) {
      console.warn(`Ignoring unusable ${WATER_BODIES_FILENAME}:`, err);
      return [];
    }
  };
}

// Persists the level's body records, local first. Returns the asset id.
export function writeWaterBodies(
  levelId: string,
  bodies: Iterable<WaterBody>
): Promise<string> {
  return db.assets.write(
    levelId,
    'chunk',
    WATER_BODIES_FILENAME,
    serializeWaterBodies(bodies)
  );
}
