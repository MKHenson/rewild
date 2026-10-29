/**
 * Benchmarks the code the web workers run, on fixed inputs.
 *
 * Run it from the repo root with `npm run bench`. See `bench/run.mjs` for the
 * options.
 */
import { parseArgs } from 'node:util';
import {
  buildChunkMesh,
  BuildChunkMeshRequest,
  ChunkMeshTimings,
} from '../lib/renderers/terrain/worker/buildChunkMesh';
import { DEFAULT_CLIMATE_PRESET } from '../lib/renderers/terrain/Biomes';
import { assembleApron } from '../lib/renderers/terrain/ApronRing';
import { BVHBuilder } from '../lib/acceleration/BVHBuilder';
import { BVHOptions } from '../lib/acceleration/BVHNode';
import { DEFAULT_BVH_CONFIG } from '../lib/acceleration/BVHConfig';
import { serializeBVH } from '../lib/acceleration/BVHSerializer';
import {
  BenchOptions,
  CaseResult,
  createReport,
  printReport,
  readReport,
  runCase,
  writeReport,
} from './harness';

/** Production chunk size. Mirrors TerrainRenderer.mapChunkSizeLod. */
const CHUNK_SIZE = 241;

/** Production LODs. Mirrors TerrainRenderer.detailLevels. */
const LODS = [0, 1, 2, 3, 4, 5, 6, 8, 10];

const SEED = 1234;

/**
 * Chunk origins in sample space, one step is CHUNK_SIZE - 1. Runs cycle
 * through them, so a result does not depend on one flat or steep chunk.
 */
const POSITIONS = [
  { x: 0, y: 0 },
  { x: 240, y: 0 },
  { x: -480, y: 720 },
  { x: 1200, y: -960 },
];

/** Terrain LODs that get a BVH. Mirrors TERRAIN_BVH_MAX_LOD in LODMesh. */
const BVH_LODS = [0, 1];

/** The options LODMesh builds a terrain BVH with. */
const TERRAIN_BVH_OPTIONS: BVHOptions = {
  strategy: DEFAULT_BVH_CONFIG.geometryBVHStrategy,
  maxDepth: DEFAULT_BVH_CONFIG.geometryBVHMaxDepth,
  // Mirrors TERRAIN_BVH_LEAF_TRIANGLES in LODMesh.
  maxLeafTriangles: 32,
};

const chunkRequest = (lod: number, index: number): BuildChunkMeshRequest => ({
  chunkSize: CHUNK_SIZE,
  lod,
  position: POSITIONS[index % POSITIONS.length],
  seed: SEED,
  climatePreset: DEFAULT_CLIMATE_PRESET,
  seaLevel: 0,
});

const timeChunk = (request: BuildChunkMeshRequest) => {
  const timings: ChunkMeshTimings = {};
  buildChunkMesh(request, timings);
  return timings as Record<string, number>;
};

function main() {
  const { values } = parseArgs({
    options: {
      runs: { type: 'string', default: '15' },
      warmup: { type: 'string', default: '3' },
      filter: { type: 'string' },
      json: { type: 'string' },
      compare: { type: 'string' },
    },
  });

  const options: BenchOptions = {
    runs: Number(values.runs),
    warmup: Number(values.warmup),
    filter: values.filter,
  };
  const results: CaseResult[] = [];
  const bench = (
    name: string,
    run: (index: number) => Record<string, number>
  ) => {
    if (options.filter && !name.includes(options.filter)) return;
    process.stderr.write(`${name}...\n`);
    results.push(runCase(name, options, run));
  };

  for (const lod of LODS) {
    bench(`terrain lod ${lod}`, (i) => timeChunk(chunkRequest(lod, i)));
  }

  // A later LOD build of a chunk that has been built once: it sends the cached
  // heights and ring, and the chunk already holds the splat and water maps.
  const firstBuilds = POSITIONS.map((_, i) =>
    buildChunkMesh(chunkRequest(0, i))
  );
  for (const lod of LODS) {
    bench(`terrain lod ${lod} reuse`, (i) => {
      const first = firstBuilds[i % firstBuilds.length];
      return timeChunk({
        ...chunkRequest(lod, i),
        apron: assembleApron(first.heights, first.ring!, CHUNK_SIZE),
        skipSplat: true,
        skipWater: true,
      });
    });
  }

  // Scatter runs once for each chunk, on whichever LOD builds first. Its cost
  // does not depend on the LOD.
  bench('terrain lod 0 + scatter', (i) =>
    timeChunk({ ...chunkRequest(0, i), scatter: true })
  );

  for (const lod of BVH_LODS) {
    const meshes = POSITIONS.map((_, i) =>
      buildChunkMesh(chunkRequest(lod, i))
    );
    bench(`bvh over terrain lod ${lod}`, (i) => {
      const mesh = meshes[i % meshes.length];
      // Copied outside the timing. The builder can reorder what it is given.
      const vertices = mesh.vertices.slice();
      const indices = mesh.indices.slice();

      const started = performance.now();
      const builder = new BVHBuilder(vertices, indices, TERRAIN_BVH_OPTIONS);
      const root = builder.build();
      const built = performance.now();
      serializeBVH(root, builder.triIndices);
      const serialized = performance.now();

      return {
        build: built - started,
        serialize: serialized - built,
        total: serialized - started,
      };
    });
  }

  const report = createReport(options, results);
  printReport(report, values.compare ? readReport(values.compare) : undefined);
  if (values.json) {
    writeReport(values.json, report);
    console.log(`wrote ${values.json}`);
  }
}

main();
