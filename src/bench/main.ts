/**
 * Benchmarks the game's main-thread systems that do CPU work over the terrain.
 *
 * Run it from the repo root with `npm run bench:game`. It takes the options of
 * `npm run bench` (see packages/rewild-renderer/bench/run.mjs).
 */
import * as R from '@dimforge/rapier3d-compat';
import { IAssetPlacement } from 'models';
import { Renderer } from 'rewild-renderer';
import { Transform } from 'rewild-renderer/lib/core/Transform';
import { Bench, runBenchmarks } from 'rewild-renderer/bench/harness';
import { DEFAULT_CLIMATE_PRESET } from 'rewild-renderer/lib/renderers/terrain/Biomes';
import { TERRAIN_METERS_PER_SAMPLE } from 'rewild-renderer/lib/renderers/terrain/MeshGenerator';
import {
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
} from 'rewild-renderer/lib/renderers/terrain/Scatter';
import { getScatterLayer } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { TerrainRenderer } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import { buildChunkMesh } from 'rewild-renderer/lib/renderers/terrain/worker/buildChunkMesh';
import {
  SCATTER_COLLIDER_ACTIVATE_DISTANCE,
  ScatterColliderStreamer,
} from '../core/physics/ScatterColliderStreamer';
import { ConformedPlacementSync } from '../core/placement/ConformedPlacementSync';

/** Production chunk size. Mirrors TerrainRenderer.mapChunkSizeLod. */
const CHUNK_SIZE = 241;

/** Metres a chunk spans. Mirrors TerrainRenderer.chunkSize. */
const CHUNK_METRES = (CHUNK_SIZE - 1) * TERRAIN_METERS_PER_SAMPLE;

const SEED = 1234;

/** Metres the viewer walks between collider updates, past their threshold. */
const WALK_STRIDE = 2.5;

/** Conformed objects in the level. */
const PLACEMENT_COUNT = 1000;

interface Chunk {
  id: string;
  cx: number;
  cy: number;
  heights: Float32Array;
  scatter: ScatterInstances[];
}

/** The 3 × 3 chunks around the origin, with their scatter. */
function chunks(): Chunk[] {
  const out: Chunk[] = [];
  for (let cy = -1; cy <= 1; cy++)
    for (let cx = -1; cx <= 1; cx++) {
      const { heights, scatter } = buildChunkMesh({
        chunkSize: CHUNK_SIZE,
        lod: 10,
        position: { x: cx * (CHUNK_SIZE - 1), y: cy * (CHUNK_SIZE - 1) },
        seed: SEED,
        climatePreset: DEFAULT_CLIMATE_PRESET,
        seaLevel: 0,
        scatter: true,
      });
      out.push({ id: `${cx},${cy}`, cx, cy, heights, scatter });
    }
  return out;
}

/**
 * A TerrainRenderer holding only the chunks' heights, which is all its height
 * and normal sampling reads. The real one needs a GPU device to build.
 */
function heightSampler(world: Chunk[]): TerrainRenderer {
  return Object.assign(Object.create(TerrainRenderer.prototype), {
    chunkSize: CHUNK_METRES,
    mapChunkSizeLod: CHUNK_SIZE,
    terrainChunks: new Map(world.map((c) => [c.id, { heights: c.heights }])),
  });
}

/** A Rapier world whose scatter colliders stream around the chunks. */
function colliderWorld(world: Chunk[]) {
  const physics = new R.World({ x: 0, y: -9.81, z: 0 });
  const streamer = new ScatterColliderStreamer(R, physics);
  for (const chunk of world)
    streamer.setChunk(
      chunk.id,
      chunk.cx * CHUNK_METRES,
      chunk.cy * CHUNK_METRES,
      CHUNK_METRES / 2,
      chunk.scatter
    );
  return { physics, streamer };
}

/** Level objects spread evenly over the chunks, all conformed and tilted. */
function placements(): IAssetPlacement[] {
  const side = Math.ceil(Math.sqrt(PLACEMENT_COUNT));
  const extent = CHUNK_METRES * 3;
  const out: IAssetPlacement[] = [];
  for (let i = 0; i < PLACEMENT_COUNT; i++)
    out.push({
      id: `${i}`,
      position: [
        ((i % side) / side - 0.5) * extent,
        0,
        (Math.floor(i / side) / side - 0.5) * extent,
      ],
      rotation: [0, 0, 0, 1],
      conform: true,
      alignToNormal: 1,
    });
  return out;
}

/**
 * The point on a 10 m grid over the chunks with the most instances that hold
 * a collider within the activate distance.
 */
function densest(world: Chunk[]): { x: number; z: number; count: number } {
  const points: number[] = [];
  for (const chunk of world)
    for (const list of chunk.scatter) {
      if (!getScatterLayer(list.layer).collider) continue;
      for (let i = 0; i < list.count; i++) {
        const base = i * SCATTER_INSTANCE_STRIDE;
        points.push(
          chunk.cx * CHUNK_METRES + list.data[base],
          chunk.cy * CHUNK_METRES + list.data[base + 2]
        );
      }
    }
  const reachSq = SCATTER_COLLIDER_ACTIVATE_DISTANCE ** 2;
  const extent = CHUNK_METRES * 1.5;
  let best = { x: 0, z: 0, count: -1 };
  for (let z = -extent; z <= extent; z += 10)
    for (let x = -extent; x <= extent; x += 10) {
      let count = 0;
      for (let k = 0; k < points.length; k += 2) {
        const dx = points[k] - x;
        const dz = points[k + 1] - z;
        if (dx * dx + dz * dz <= reachSq) count++;
      }
      if (count > best.count) best = { x, z, count };
    }
  return best;
}

function defineCases(bench: Bench, world: Chunk[]) {
  const terrain = heightSampler(world);
  const ground = (x: number, z: number) => terrain.sampleHeight(x, z) ?? 0;
  const forest = densest(world);
  process.stderr.write(
    `  densest point (${forest.x}, ${forest.z}): ${forest.count} colliders in reach
`
  );

  // Every chunk's scatter arriving at once, with the viewer standing at the
  // densest point: each instance near enough gains its collider in one update.
  bench('scatter colliders arrive', () => {
    const physics = new R.World({ x: 0, y: -9.81, z: 0 });
    const started = performance.now();
    const streamer = new ScatterColliderStreamer(R, physics);
    for (const chunk of world)
      streamer.setChunk(
        chunk.id,
        chunk.cx * CHUNK_METRES,
        chunk.cy * CHUNK_METRES,
        CHUNK_METRES / 2,
        chunk.scatter
      );
    streamer.update(forest.x, ground(forest.x, forest.z) + 1.7, forest.z);
    const total = performance.now() - started;
    streamer.dispose();
    physics.free();
    return { total };
  });

  // The viewer walking east from the densest point, one update each stride.
  const walk = colliderWorld(world);
  let step = 0;
  bench('scatter colliders walk', () => {
    const x = forest.x + step++ * WALK_STRIDE;
    const started = performance.now();
    walk.streamer.update(x, ground(x, forest.z) + 1.7, forest.z);
    return { total: performance.now() - started };
  });

  // A chunk loading, which re-derives the objects standing on it, and every
  // object at once, as a seed change does.
  const objects = placements();
  const transforms = objects.map(() => new Transform());
  const renderer = { terrainRenderer: terrain, sceneBVH: null };
  const sync = new ConformedPlacementSync(
    renderer as unknown as Renderer,
    (visit) => {
      for (let i = 0; i < objects.length; i++) visit(objects[i], transforms[i]);
    }
  );
  bench('conform chunk loaded', () => {
    const started = performance.now();
    sync.resolveChunk('0,0');
    return { total: performance.now() - started };
  });
  bench('conform all', () => {
    const started = performance.now();
    sync.resolveAll();
    return { total: performance.now() - started };
  });

  const walked = walk.streamer.stats();
  process.stderr.write(
    `  ${walked.candidates} collider candidates, ${walked.active} held after the walk\n`
  );
}

await R.init();
await runBenchmarks((bench) => defineCases(bench, chunks()));
