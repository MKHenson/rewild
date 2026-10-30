/**
 * Benchmarks the code the web workers run, on fixed inputs.
 *
 * Run it from the repo root with `npm run bench`. See `bench/run.mjs` for the
 * options.
 */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildChunkMesh,
  BuildChunkMeshRequest,
  ChunkMeshTimings,
} from '../lib/renderers/terrain/worker/buildChunkMesh';
import {
  DEFAULT_CLIMATE_PRESET,
  resolveClimatePreset,
} from '../lib/renderers/terrain/Biomes';
import { assembleApron } from '../lib/renderers/terrain/ApronRing';
import { BVHOptions } from '../lib/acceleration/BVHOptions';
import { DEFAULT_BVH_CONFIG } from '../lib/acceleration/BVHConfig';
import { buildBVHWasm } from '../lib/acceleration/BVHWasm';
import { BVH } from '../lib/acceleration/BVH';
import { Geometry } from '../lib/geometry/Geometry';
import { Intersection } from '../lib/core/Raycaster';
import { Ray, Vector3 } from 'rewild-common';
import { loadRewildWasmSync } from '../lib/wasm/RewildWasm';
import {
  FAR_MAP_TEXELS,
  FarMapBuilder,
  NEAR_FAR_MAP_SPAN,
  NEAR_FAR_MAP_TEXELS,
  WIDE_FAR_MAP_SPAN,
} from '../lib/renderers/water/HorizonCoverage';
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

/** Rays for each raycast run. */
const RAY_COUNT = 1000;

/**
 * Rays over a mesh: half fall steeply from above, like a player or object
 * probing the ground, and half cross it at a shallow angle, like a cursor
 * pick from a standing camera. An LCG keeps them stable.
 */
function terrainRays(vertices: Float32Array): Ray[] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], vertices[i + k]);
      max[k] = Math.max(max[k], vertices[i + k]);
    }

  let state = 7;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const at = (k: number) => min[k] + next() * (max[k] - min[k]);

  const rays: Ray[] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const target = new Vector3(at(0), at(1), at(2));
    const origin =
      i % 2 === 0
        ? new Vector3(target.x, max[1] + 10, target.z)
        : new Vector3(next() < 0.5 ? min[0] : max[0], max[1] + 2, at(2));
    rays.push(new Ray(origin, target.sub(origin).normalize()));
  }
  return rays;
}

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

async function main() {
  // The bundle runs from bench/build/, which npm run bench builds first.
  loadRewildWasmSync(
    readFileSync(
      fileURLToPath(
        new URL('../../../rewild-wasm/pkg/rewild_wasm_bg.wasm', import.meta.url)
      )
    )
  );

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

  // A whole far map rebuild of each HorizonOcean level. In the game it is
  // spread over frames; this is its total.
  const climate = resolveClimatePreset(DEFAULT_CLIMATE_PRESET);
  for (const [level, span, texels] of [
    ['near', NEAR_FAR_MAP_SPAN, NEAR_FAR_MAP_TEXELS],
    ['wide', WIDE_FAR_MAP_SPAN, FAR_MAP_TEXELS],
  ] as const) {
    bench(`far map ${level}`, (i) => {
      const position = POSITIONS[i % POSITIONS.length];
      const started = performance.now();
      new FarMapBuilder(SEED, climate, position.x, position.y, span, texels).build();
      return { total: performance.now() - started };
    });
  }

  for (const lod of BVH_LODS) {
    const meshes = POSITIONS.map((_, i) =>
      buildChunkMesh(chunkRequest(lod, i))
    );
    // One call does the build and writes the serialised layout. Its time
    // includes copying the mesh into WASM memory and the result back out.
    bench(`bvh over terrain lod ${lod}`, (i) => {
      const mesh = meshes[i % meshes.length];
      const started = performance.now();
      buildBVHWasm(mesh.vertices, mesh.indices, TERRAIN_BVH_OPTIONS);
      return { total: performance.now() - started };
    });

    const bvhs = meshes.map(
      (mesh) =>
        new BVH(
          { vertices: mesh.vertices, indices: mesh.indices } as Geometry,
          TERRAIN_BVH_OPTIONS
        )
    );
    const rays = meshes.map((mesh) => terrainRays(mesh.vertices));
    // RAY_COUNT rays a run, double-sided, as Mesh.raycast casts them.
    bench(`bvh raycast lod ${lod}`, (i) => {
      const bvh = bvhs[i % bvhs.length];
      const started = performance.now();
      for (const ray of rays[i % rays.length]) {
        const hits: Intersection[] = [];
        bvh.raycast(ray, 'none', 0, Infinity, hits);
      }
      return { total: performance.now() - started };
    });
    bench(`bvh raycast first lod ${lod}`, (i) => {
      const bvh = bvhs[i % bvhs.length];
      const started = performance.now();
      for (const ray of rays[i % rays.length])
        bvh.raycastFirst(ray, 'none', 0, Infinity);
      return { total: performance.now() - started };
    });
    bench(`bvh refit lod ${lod}`, (i) => {
      const bvh = bvhs[i % bvhs.length];
      const started = performance.now();
      bvh.refit();
      return { total: performance.now() - started };
    });
  }

  const report = createReport(options, results);
  printReport(report, values.compare ? readReport(values.compare) : undefined);
  if (values.json) {
    writeReport(values.json, report);
    console.log(`wrote ${values.json}`);
  }
}

await main();
