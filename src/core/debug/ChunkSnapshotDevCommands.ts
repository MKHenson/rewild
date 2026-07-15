import { IProject } from 'models';
import { Renderer, resolveClimatePreset } from 'rewild-renderer';
import { generateBiomeBlendedHeightMap } from 'rewild-renderer/lib/renderers/terrain/Noise';
import { Vector2 } from 'rewild-common';
import { db } from 'src/database/database';
import { writeChunkSnapshot } from 'src/database/chunk-snapshots';

// Dev/verification console commands for the chunk-snapshot round-trip
// (#173 read, #174 write). writeChunkSnapshotFixture simulates an edit the way
// sculpting (#175) will: take the chunk's current in-memory LOD-0 heights,
// modify them (an unmistakable plateau), persist via the asset path, and
// re-mesh just that chunk in place — no reload, neighbours untouched.
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
    const chunk = terrain.terrainChunks.get(`${cx},${cy}`);

    // Capture: the chunk's current in-memory heights (includes prior edits).
    // A chunk that was never loaded has none — generate its unedited baseline,
    // which is byte-identical to what the worker would produce for it.
    const heights = chunk?.heights
      ? new Float32Array(chunk.heights)
      : generateBiomeBlendedHeightMap(
          size,
          size,
          terrain.seed,
          new Vector2(cx * (size - 1), cy * (size - 1)),
          resolveClimatePreset(terrain.climatePreset)
        );

    // The "edit": a smooth flat-topped plateau in the chunk centre —
    // unmistakably hand-made, so "meshed from storage" is visible at a glance.
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

    await writeChunkSnapshot(levelId, cx, cy, heights, size);

    // Show the change without a reload: apply the edited heights to the loaded
    // chunk and rebuild only its meshes. If it isn't loaded, it will mesh from
    // the snapshot whenever it comes into view.
    const applied = terrain.applyChunkHeights(cx, cy, heights);
    console.log(
      `Wrote snapshot for chunk ${cx},${cy} — ${applied ? 're-meshing in place' : 'will mesh from storage when loaded'}. Sync uploads it on next save/publish or login.`
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
