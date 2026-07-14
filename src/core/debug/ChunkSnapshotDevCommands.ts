import { IProject } from 'models';
import { Renderer, resolveClimatePreset, serializeChunkSnapshot, chunkSnapshotFilename } from 'rewild-renderer';
import { generateBiomeBlendedHeightMap } from 'rewild-renderer/lib/renderers/terrain/Noise';
import { Vector2 } from 'rewild-common';
import { db } from 'src/database/database';

// Dev/verification console commands for the chunk-snapshot read path (#173).
// writeChunkSnapshotFixture stamps an obviously artificial plateau into an
// otherwise-correct heightfield and saves it as a snapshot, so a reload of the
// chunk visibly meshes from storage while its neighbours still generate. The
// real writer (sculpting) lands with #174/#175.
export function registerChunkSnapshotDevCommands(
  renderer: Renderer,
  project: IProject
) {
  (window as any).writeChunkSnapshotFixture = async (
    cx: number = 0,
    cy: number = 0
  ) => {
    const levelId = project.levelId;
    if (!levelId) {
      console.warn('No levelId on the current project — cannot write a snapshot.');
      return;
    }

    const terrain = renderer.terrainRenderer;
    const size = terrain.mapChunkSizeLod; // LOD-0 samples per side (241)
    const worldStep = size - 1; // chunk world size (240)
    const heights = generateBiomeBlendedHeightMap(
      size,
      size,
      terrain.seed,
      new Vector2(cx * worldStep, cy * worldStep),
      resolveClimatePreset(terrain.climatePreset)
    );

    // Stamp a smooth flat-topped plateau in the chunk centre — unmistakably
    // hand-made, so "meshed from storage" is visible at a glance.
    const centre = (size - 1) / 2;
    const radius = size * 0.35;
    const plateauHeight = 60;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - centre, y - centre) / radius;
        if (d >= 1) continue;
        const t = 1 - d * d * (3 - 2 * d); // smoothstep falloff, 1 at centre
        const i = y * size + x;
        heights[i] = heights[i] + (plateauHeight - heights[i]) * t;
      }
    }

    const blob = serializeChunkSnapshot(heights, size, size);
    await db.assets.write(levelId, 'chunk', chunkSnapshotFilename(cx, cy), blob);

    // Rebuild terrain so the chunk re-fetches and meshes the stored heights.
    terrain.reset(terrain.seed, renderer);
    console.log(
      `Wrote fixture snapshot for chunk ${cx},${cy} (${chunkSnapshotFilename(cx, cy)}) — terrain reloading.`
    );
  };

  (window as any).clearChunkSnapshots = async () => {
    const levelId = project.levelId;
    if (!levelId) {
      console.warn('No levelId on the current project — nothing to clear.');
      return;
    }

    await db.assets.removeChunksByLevel(levelId);
    renderer.terrainRenderer.reset(renderer.terrainRenderer.seed, renderer);
    console.log('Removed all chunk snapshots for this level — terrain reloading.');
  };
}
