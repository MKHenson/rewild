import { IProject } from 'models';
import { Renderer, resolveClimatePreset } from 'rewild-renderer';
import {
  MAX_WATER_TYPES,
  LAKE_WATER,
  getWaterTypeIndex,
} from 'rewild-renderer/lib/renderers/terrain/Water';
import {
  TouchedWaterChunk,
  WaterStampType,
  applyWaterStamp,
  editedBodyId,
} from 'rewild-renderer/lib/renderers/terrain/WaterEdit';
import { writeWaterEdit } from 'src/database/water-edits';

// Console commands that write water edits the way the water brush will: stamp
// the loaded chunks under a disc, rebuild their water, and save the edits. They
// default to the viewer's position.
export function registerWaterEditDevCommands(
  renderer: Renderer,
  project: IProject
) {
  const stamp = async (
    type: WaterStampType,
    x: number | undefined,
    z: number | undefined,
    radius: number,
    level: number | undefined
  ) => {
    const levelId = project.levelId;
    if (!levelId) {
      console.warn(
        'No levelId on the current project — water edits not saved.'
      );
      return;
    }

    const terrain = renderer.terrainRenderer;
    const centerX = x ?? terrain.viewerPosition.x;
    const centerZ = z ?? terrain.viewerPosition.z;
    const ground = terrain.sampleHeight(centerX, centerZ);
    const surface = level ?? (ground ?? terrain.seaLevel) + 1.5;

    const span = terrain.chunkSize;
    const half = span / 2;
    const reads: Promise<unknown>[] = [];
    for (
      let cy = Math.ceil((centerZ - radius - half) / span);
      cy <= Math.floor((centerZ + radius + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((centerX - radius - half) / span);
        cx <= Math.floor((centerX + radius + half) / span);
        cx++
      ) {
        const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
        if (chunk)
          reads.push(chunk.resolveWaterEdit(terrain.waterEditProvider));
      }
    await Promise.all(reads);

    const climate = resolveClimatePreset(terrain.climatePreset);
    const typeWeights = new Array<number>(MAX_WATER_TYPES).fill(0);
    typeWeights[Math.max(0, getWaterTypeIndex(climate, LAKE_WATER))] = 1;

    const source = {
      chunkSize: terrain.mapChunkSizeLod,
      metersPerSample: terrain.metersPerSample,
      getEdit: (cx: number, cy: number) =>
        terrain.terrainChunks.get(`${cx},${cy}`)?.editableWaterEdit() ?? null,
    };
    const bodyId = editedBodyId(
      Math.imul(Math.round(centerX), 73856093) ^
        Math.imul(Math.round(centerZ), 19349663)
    );
    // A reset eases the edit's hold toward the generator; held long enough it
    // lets go of the whole disc.
    const passes = type === 'reset' ? 64 : 1;
    const edited = new Map<string, TouchedWaterChunk>();
    for (let pass = 0; pass < passes; pass++)
      for (const t of applyWaterStamp(source, {
        type,
        centerX,
        centerZ,
        radius,
        amount: 1,
        level: surface,
        bodyId,
        typeWeights,
      }))
        edited.set(`${t.cx},${t.cy}`, t);
    const touched = [...edited.values()];

    await Promise.all(
      touched.map((t) => {
        terrain.refreshChunkWater(t.cx, t.cy);
        return writeWaterEdit(levelId, t.cx, t.cy, t.edit);
      })
    );
    console.log(
      `${type}Water: ${
        touched.length
      } chunk(s) edited and saved around (${centerX.toFixed(
        1
      )}, ${centerZ.toFixed(1)}), radius ${radius} m${
        type === 'add' ? `, level ${surface.toFixed(2)} m` : ''
      }.`
    );
  };

  (window as any).addWater = (
    x?: number,
    z?: number,
    radius = 20,
    level?: number
  ) => stamp('add', x, z, radius, level);

  (window as any).removeWater = (x?: number, z?: number, radius = 20) =>
    stamp('remove', x, z, radius, undefined);

  (window as any).resetWater = (x?: number, z?: number, radius = 20) =>
    stamp('reset', x, z, radius, undefined);
}
