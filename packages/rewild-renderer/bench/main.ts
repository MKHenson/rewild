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
  applySculptStamp,
  SculptBrushType,
} from '../lib/renderers/terrain/Sculpt';
import { HeightPatch } from '../lib/renderers/terrain/HeightPatch';
import { sculptStamp } from '../../rewild-wasm/pkg/rewild_wasm';
import {
  applyCarveStamp,
  applyCutBank,
  applyWaterLip,
  CutGrid,
  SHORE_REACH,
  ShoreGrid,
} from '../lib/renderers/terrain/WaterCarve';
import {
  WATER_EDIT_STEP,
  WaterGuard,
} from '../lib/renderers/terrain/WaterEdit';
import { TERRAIN_METERS_PER_SAMPLE } from '../lib/renderers/terrain/MeshGenerator';
import { generateSplatMap } from '../lib/renderers/terrain/Splat';
import { Vector2 } from 'rewild-common';
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

/** The four chunks that meet at sample (120, 120), which editing cases straddle. */
const EDIT_CHUNKS = [
  { cx: 0, cy: 0 },
  { cx: 1, cy: 0 },
  { cx: 0, cy: 1 },
  { cx: 1, cy: 1 },
];

/** World metres of the corner the edit chunks share. */
const EDIT_CORNER = ((CHUNK_SIZE - 1) / 2) * TERRAIN_METERS_PER_SAMPLE;

/** The largest sculpt brush, SCULPT_RADIUS_MAX. */
const SCULPT_RADIUS = 100;

/** The largest smooth kernel, SMOOTH_KERNEL_MAX in the sculpt controller. */
const SMOOTH_KERNEL = 8;

/** The largest water brush, WATER_BRUSH_RADIUS_MAX. */
const WATER_RADIUS = 200;

/** A world texel box around the edit corner, `reach` metres out. */
function texelBox(reach: number) {
  const unit = WATER_EDIT_STEP * TERRAIN_METERS_PER_SAMPLE;
  const i0 = Math.floor((EDIT_CORNER - reach) / unit);
  const i1 = Math.ceil((EDIT_CORNER + reach) / unit);
  const width = i1 - i0 + 1;
  return { i0, j0: i0, width, height: width, count: width * width };
}

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

  // Editing on the main thread. Each run edits fresh copies of four generated
  // chunks at the corner they share, so the brush writes to all four.
  const editHeights = EDIT_CHUNKS.map(({ cx, cy }) =>
    buildChunkMesh({
      ...chunkRequest(0, 0),
      position: { x: cx * (CHUNK_SIZE - 1), y: cy * (CHUNK_SIZE - 1) },
    })
  );
  const editSource = () => {
    const chunks = new Map(
      EDIT_CHUNKS.map(({ cx, cy }, i) => [
        `${cx},${cy}`,
        editHeights[i].heights.slice(),
      ])
    );
    return {
      chunkSize: CHUNK_SIZE,
      metersPerSample: TERRAIN_METERS_PER_SAMPLE,
      getHeights: (cx: number, cy: number) => chunks.get(`${cx},${cy}`) ?? null,
      getBaseline: (cx: number, cy: number) =>
        editHeights[EDIT_CHUNKS.findIndex((c) => c.cx === cx && c.cy === cy)]
          ?.heights ?? null,
    };
  };
  const timeEdit = (edit: () => unknown) => {
    const started = performance.now();
    edit();
    return { total: performance.now() - started };
  };

  for (const type of [
    'raise',
    'smooth',
    'flatten',
    'reset',
  ] as SculptBrushType[]) {
    bench(`sculpt ${type}`, () => {
      const source = editSource();
      return timeEdit(() =>
        applySculptStamp(source, {
          type,
          centerX: EDIT_CORNER,
          centerZ: EDIT_CORNER,
          radius: SCULPT_RADIUS,
          amount: 0.5,
          target: 20,
          smoothKernel: SMOOTH_KERNEL,
        })
      );
    });
  }

  // The copies of the largest raise stamp: gathering its patch from the four
  // chunks, a call that copies the patch into WASM memory and back and does no
  // work, and writing the patch back to the chunks.
  bench('sculpt copies', () => {
    const source = editSource();
    const radius = SCULPT_RADIUS / TERRAIN_METERS_PER_SAMPLE;
    const centre = EDIT_CORNER / TERRAIN_METERS_PER_SAMPLE;
    const lo = Math.ceil(centre - radius);
    const hi = Math.floor(centre + radius);
    const started = performance.now();
    const patch = new HeightPatch(source, lo, lo, hi, hi);
    const gathered = performance.now();
    sculptStamp(
      ...patch.args(),
      new Float32Array(0),
      'raise',
      0,
      0,
      1,
      0,
      0,
      0
    );
    const called = performance.now();
    patch.commit(new Int32Array([0, 0, 1, 0, 0, 1, 1, 1]));
    const committed = performance.now();
    return {
      gather: gathered - started,
      boundary: called - gathered,
      commit: committed - called,
    };
  });

  const waterBox = texelBox(WATER_RADIUS + SHORE_REACH);
  const guard: WaterGuard = {
    ...waterBox,
    blocked: new Uint8Array(waterBox.count),
  };
  bench('water carve', () => {
    const source = editSource();
    const originals = new Map(
      EDIT_CHUNKS.map(({ cx, cy }) => [
        `${cx},${cy}`,
        source.getHeights(cx, cy)!.slice(),
      ])
    );
    const targets = new Map(
      EDIT_CHUNKS.map(({ cx, cy }) => [
        `${cx},${cy}`,
        new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(Infinity),
      ])
    );
    return timeEdit(() =>
      applyCarveStamp(source, {
        centerX: EDIT_CORNER,
        centerZ: EDIT_CORNER,
        radius: WATER_RADIUS,
        level: 0,
        depth: 3,
        amount: 0.5,
        guard,
        original: (cx, cy) => originals.get(`${cx},${cy}`) ?? null,
        targets: (cx, cy) => targets.get(`${cx},${cy}`) ?? null,
      })
    );
  });

  // A stroke of three stamps along x.
  const discs = [-WATER_RADIUS / 2, 0, WATER_RADIUS / 2].flatMap((dx) => [
    EDIT_CORNER + dx,
    EDIT_CORNER,
    WATER_RADIUS,
  ]);
  const strokeBox = texelBox((3 * WATER_RADIUS) / 2 + SHORE_REACH);
  const shore: ShoreGrid = {
    ...strokeBox,
    wet: new Uint8Array(strokeBox.count),
    own: new Uint8Array(strokeBox.count),
  };
  bench('water lip', () => {
    const source = editSource();
    return timeEdit(() =>
      applyWaterLip(source, shore, discs, 0, 1, (cx, cy) =>
        source.getBaseline(cx, cy)
      )
    );
  });

  // Water that stays covers the texels east of the corner.
  const cut: CutGrid = {
    ...strokeBox,
    level: new Float32Array(strokeBox.count).fill(NaN),
    covered: new Uint8Array(strokeBox.count),
    released: [],
  };
  for (let g = 0; g < strokeBox.count; g++)
    if (g % strokeBox.width > strokeBox.width / 2) {
      cut.level[g] = 0;
      cut.covered[g] = 1;
    }
  bench('water cut bank', () => {
    const source = editSource();
    return timeEdit(() => applyCutBank(source, cut, discs, 1));
  });

  // A splat repaint under the largest sculpt brush, and under one texel, whose
  // time is mostly the copies of the chunk's heights and splat.
  const splatChunk = editHeights[0];
  const splatClimate = resolveClimatePreset(DEFAULT_CLIMATE_PRESET);
  const splatRadius = Math.ceil(SCULPT_RADIUS / TERRAIN_METERS_PER_SAMPLE) + 4;
  for (const [name, x0, x1] of [
    ['brush', CHUNK_SIZE - 1 - 2 * splatRadius, CHUNK_SIZE - 1],
    ['texel', 120, 120],
  ] as const) {
    bench(`splat repaint ${name}`, () =>
      timeEdit(() =>
        generateSplatMap(
          CHUNK_SIZE,
          CHUNK_SIZE,
          SEED,
          new Vector2(0, 0),
          splatClimate,
          splatChunk.heights,
          {
            out: splatChunk.splat,
            region: { x0, y0: 0, x1, y1: x1 - x0 },
          }
        )
      )
    );
  }

  // A whole far map rebuild of each HorizonOcean level. In the game it is
  // spread over frames; this is its total.
  const climate = splatClimate;
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
