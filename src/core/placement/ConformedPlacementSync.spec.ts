import { IAssetPlacement } from 'models';
import { Transform } from 'rewild-renderer';
import { Renderer } from 'rewild-renderer';
import { TerrainRenderer } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import { ConformedPlacementSync } from './ConformedPlacementSync';

/** A terrain with one flat chunk per entry of `chunkHeights`, keyed by id. */
function terrainWith(chunkHeights: Record<string, number>): TerrainRenderer {
  const terrain = new TerrainRenderer();
  const size = terrain.mapChunkSizeLod;
  terrain.chunkSize = (size - 1) * terrain.metersPerSample;

  for (const [id, height] of Object.entries(chunkHeights)) {
    const heights = new Float32Array(size * size).fill(height);
    (terrain as any).terrainChunks.set(id, { heights });
  }
  return terrain;
}

function rendererFor(terrain: TerrainRenderer): Renderer {
  return { terrainRenderer: terrain, sceneBVH: null } as unknown as Renderer;
}

function chunkLoaded(terrain: TerrainRenderer, id: string): void {
  terrain.dispatcher.dispatch({
    type: 'chunk-loaded',
    chunk: { id } as any,
    lod: null as any,
  });
}

/** One conformed object sitting at world x, on whichever chunk owns it. */
function target(x: number, overrides: Partial<IAssetPlacement> = {}) {
  const placement: IAssetPlacement = {
    id: 'a',
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    conform: true,
    yOffset: 0,
    alignToNormal: 0,
    ...overrides,
  };
  return { placement, transform: new Transform() };
}

function syncOf(
  terrain: TerrainRenderer,
  ...targets: { placement: IAssetPlacement; transform: Transform }[]
): ConformedPlacementSync {
  const sync = new ConformedPlacementSync(rendererFor(terrain), (visit) => {
    for (const t of targets) visit(t.placement, t.transform);
  });
  sync.start();
  return sync;
}

describe('ConformedPlacementSync', () => {
  it('re-derives an object when the chunk under it rebuilds', () => {
    const terrain = terrainWith({ '0,0': 70 });
    const a = target(0);
    syncOf(terrain, a);

    chunkLoaded(terrain, '0,0');

    expect(a.transform.position.y).toBeCloseTo(70);
  });

  it('picks the object up once its chunk finally streams in', () => {
    // The case with no author action behind it: the object mounted while its
    // chunk had no heights, so it is sitting on its stored fallback.
    const terrain = terrainWith({});
    const a = target(0, { position: [0, 999, 0] });
    const sync = syncOf(terrain, a);

    sync.resolveAll();
    expect(a.transform.position.y).toBe(0);

    (terrain as any).terrainChunks.set('0,0', {
      heights: new Float32Array(
        terrain.mapChunkSizeLod * terrain.mapChunkSizeLod
      ).fill(12),
    });
    chunkLoaded(terrain, '0,0');

    expect(a.transform.position.y).toBeCloseTo(12);
  });

  it('leaves objects standing on other chunks alone', () => {
    const span = (241 - 1) * 2;
    const terrain = terrainWith({ '0,0': 70, '1,0': 5 });
    const here = target(0);
    const elsewhere = target(terrain.chunkSize || span);
    syncOf(terrain, here, elsewhere);

    chunkLoaded(terrain, '0,0');

    expect(here.transform.position.y).toBeCloseTo(70);
    expect(elsewhere.transform.position.y).toBe(0);
  });

  it('never touches an unconformed object', () => {
    const terrain = terrainWith({ '0,0': 70 });
    const absolute = target(0, { conform: false, position: [0, 3, 0] });
    syncOf(terrain, absolute);

    chunkLoaded(terrain, '0,0');

    expect(absolute.transform.position.y).toBe(0);
  });

  it('keeps up as the ground is sculpted under it', () => {
    const terrain = terrainWith({ '0,0': 70 });
    const a = target(0);
    syncOf(terrain, a);
    chunkLoaded(terrain, '0,0');

    // A sculpt replaces the chunk's heights and re-meshes, which raises
    // chunk-loaded again — the same path a snapshot or seed change takes.
    (terrain as any).terrainChunks.get('0,0').heights.fill(95);
    chunkLoaded(terrain, '0,0');

    expect(a.transform.position.y).toBeCloseTo(95);
  });

  it('stops listening once stopped', () => {
    const terrain = terrainWith({ '0,0': 70 });
    const a = target(0);
    syncOf(terrain, a).stop();

    chunkLoaded(terrain, '0,0');

    expect(a.transform.position.y).toBe(0);
  });

  it('applies yOffset and reports whether it moved anything', () => {
    const terrain = terrainWith({ '0,0': 70 });
    const a = target(0, { yOffset: 2.5 });
    const results: boolean[] = [];
    const sync = new ConformedPlacementSync(rendererFor(terrain), (visit) =>
      results.push(visit(a.placement, a.transform))
    );
    sync.start();

    chunkLoaded(terrain, '0,0');
    expect(a.transform.position.y).toBeCloseTo(72.5);
    expect(results).toEqual([true]);

    // A chunk the object does not stand on reports no movement.
    chunkLoaded(terrain, '3,3');
    expect(results).toEqual([true, false]);
  });
});
