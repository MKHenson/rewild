import type { Renderer } from 'rewild-renderer';
import type { AssetReader } from '../database/local-asset-store';
import { createChunkSnapshotProvider } from '../database/chunk-snapshots';
import { createBiomeMaskProvider } from '../database/biome-masks';
import { createScatterMaskProvider } from '../database/scatter-masks';
import { createWaterEditProvider } from '../database/water-edits';
import { createWaterBodyProvider } from '../database/water-bodies';
import { createScatterKillProvider } from '../database/scatter-kills';

/** Points the terrain at a level's files. Null leaves every chunk generated. */
export function setTerrainProviders(renderer: Renderer, read: AssetReader | null) {
  const terrain = renderer.terrainRenderer;
  terrain.snapshotProvider = read ? createChunkSnapshotProvider(read) : null;
  terrain.biomeMaskProvider = read ? createBiomeMaskProvider(read) : null;
  terrain.scatterMaskProvider = read ? createScatterMaskProvider(read) : null;
  terrain.waterEditProvider = read ? createWaterEditProvider(read) : null;
  terrain.waterBodyProvider = read ? createWaterBodyProvider(read) : null;
  terrain.scatterKillProvider = read ? createScatterKillProvider(read) : null;
}
