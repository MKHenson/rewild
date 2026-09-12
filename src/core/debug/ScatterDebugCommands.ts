import {
  Renderer,
  SCATTER_LAYERS,
  getScatterLayerOrder,
} from 'rewild-renderer';

// Scatter inspection.
//
// Whether a rock is on screen depends on four separate things — the chunk
// generated instances, the layer is within its cull distance, some LOD tier's
// band covers it, and the scene BVH kept it — and all four failing look
// identical from the camera. These print them apart.

export function registerScatterDebugCommands(renderer: Renderer) {
  (window as any).showScatterStats = () => {
    const chunks = renderer.terrainRenderer.terrainChunks;
    const rows: Record<string, unknown>[] = [];
    const totals = new Map<string, { draws: number; held: number }>();

    let withScatter = 0;
    for (const [id, chunk] of chunks) {
      const scatter = chunk.scatter;
      if (!scatter) continue;
      withScatter++;

      for (const layer of scatter.describe()) {
        const key = `${layer.layer} LOD ${layer.tier}`;
        const total = totals.get(key) ?? { draws: 0, held: 0 };
        total.held += layer.instances;
        if (layer.visible) total.draws++;
        totals.set(key, total);

        rows.push({
          chunk: id,
          layer: layer.layer,
          tier: layer.tier,
          instances: layer.instances,
          drawn: layer.visible,
          distance: Math.round(layer.distance),
          band: `${layer.nearDistance}..${layer.cullDistance}`,
        });
      }
    }

    console.log(
      `showScatterStats() — ${withScatter} of ${chunks.size} resident chunks ` +
        `hold instances; LOD bias ${renderer.terrainRenderer.scatterLodBias}.\n` +
        `Every tier of a layer draws the same instances and keeps only those ` +
        `inside its band, so a chunk's instances count once per tier. ` +
        `'distance' is what the cull measured at the last visibility update, ` +
        `against the layer's own instance bounds. drawn=false with distance ` +
        `under the band's end means the cull is stale; a chunk missing ` +
        `entirely means it never generated.`
    );
    console.table(
      Array.from(totals, ([layer, total]) => ({
        layer,
        chunkDraws: total.draws,
        instancesHeld: total.held,
      }))
    );
    console.table(
      rows.sort((a, b) => (a.distance as number) - (b.distance as number))
    );
  };

  (window as any).showScatterChunks = () => {
    const rows: Record<string, unknown>[] = [];

    for (const [id, chunk] of renderer.terrainRenderer.terrainChunks) {
      rows.push({
        chunk: id,
        visible: chunk.visible,
        heights: chunk.heights ? 'yes' : 'no',
        scatterLayers: chunk.scatter ? chunk.scatter.describe().length : 0,
        scatterVersion: chunk.scatterVersion,
        heightsVersion: chunk.heightsVersion,
      });
    }

    console.log(
      `showScatterChunks() — every resident chunk, whether it generated ` +
        `scatter and at which heights version. scatterVersion -1 means it ` +
        `never ran; a version behind heightsVersion means the instances are ` +
        `placed against heights that have since changed.`
    );
    console.table(rows);
  };

  (window as any).setScatterLayerEnabled = (name: string, enabled: boolean) => {
    if (!SCATTER_LAYERS[name]) {
      console.warn(
        `Unknown scatter layer '${name}'. Known: ${getScatterLayerOrder().join(
          ', '
        )}`
      );
      return;
    }

    // Pushing the cull distance to zero is the off switch that needs no state
    // of its own — the next visibility pass drops every chunk's copy.
    const layer = SCATTER_LAYERS[name];
    (layer as { cullDistance: number }).cullDistance = enabled
      ? SCATTER_CULL_DISTANCES.get(name) ?? layer.cullDistance
      : 0;

    console.log(
      `setScatterLayerEnabled('${name}', ${enabled}) — takes effect on the ` +
        `next visibility update, so move a little to see it.`
    );
  };

  (window as any).setScatterLodBias = (bias: number) => {
    const terrain = renderer.terrainRenderer;
    terrain.scatterLodBias = Math.round(bias);
    terrain.requestVisibilityUpdate();

    console.log(
      `setScatterLodBias(${terrain.scatterLodBias}) — every layer shifted ` +
        `${Math.abs(terrain.scatterLodBias)} tier(s) ${
          terrain.scatterLodBias >= 0 ? 'coarser' : 'finer'
        }. Past a layer's last tier nothing draws; 0 restores the table.`
    );
  };

  (window as any).showScatterLodTiers = (enabled = true) => {
    renderer.terrainRenderer.scatterLodTint = enabled;
    console.log(
      `showScatterLodTiers(${enabled}) — ${
        enabled
          ? 'tinting instances by LOD tier: green 0, yellow 1, orange 2, red 3+. The impostor is the last tier.'
          : 'tint off.'
      }`
    );
  };
}

// The authored cull distances, captured before anything can disable a layer, so
// re-enabling restores the table's own value.
const SCATTER_CULL_DISTANCES = new Map(
  Object.entries(SCATTER_LAYERS).map(([name, layer]) => [
    name,
    layer.cullDistance,
  ])
);
