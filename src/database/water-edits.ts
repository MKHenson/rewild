// Deep import: only the edit format, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  WaterEdit,
  WaterEditProvider,
  deserializeWaterEdit,
  serializeWaterEdit,
} from 'rewild-renderer/lib/renderers/terrain/WaterEdit';
import { db } from './database';
import type { AssetReader, LevelRef } from './local-asset-store';

// Storage name on the asset path, beside the chunk's height snapshot and masks:
// projects/{projectId}/levels/{levelId}/chunk/{cx}_{cy}.water.bin.
export function waterEditFilename(cx: number, cy: number): string {
  return `${cx}_${cy}.water.bin`;
}

// Bridges the renderer's edit lookup to the level's files. Resolves null when
// the chunk's water has never been edited (or the blob is unusable), which
// leaves the chunk with its generated water.
export function createWaterEditProvider(read: AssetReader): WaterEditProvider {
  return async (cx: number, cy: number) => {
    const buffer = await read('chunk', waterEditFilename(cx, cy));
    if (!buffer) return null;

    try {
      return deserializeWaterEdit(buffer);
    } catch (err) {
      console.warn(`Ignoring unusable water edit ${cx}_${cy}.water.bin:`, err);
      return null;
    }
  };
}

// Persists a chunk's water edit on the asset path, local first with the same
// semantics as writeBiomeMask. Returns the asset id.
export function writeWaterEdit(
  level: LevelRef,
  cx: number,
  cy: number,
  edit: WaterEdit
): Promise<string> {
  return db.assets.write(
    { ...level, assetType: 'chunk', filename: waterEditFilename(cx, cy) },
    serializeWaterEdit(edit)
  );
}
