/**
 * Benchmarks the code the web workers run, on fixed inputs.
 *
 * Run it from the repo root with `npm run bench`. See `bench/run.mjs` for the
 * options.
 */
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
import { Box3, Frustum, Matrix4, Vector2 } from 'rewild-common';
import { ChunkScatter } from '../lib/renderers/terrain/ChunkScatter';
import { ScatterChunkLayer } from '../lib/renderers/terrain/ScatterChunkLayer';
import {
  getScatterGenerationDistance,
  getScatterLayer,
  lodTierCount,
} from '../lib/renderers/terrain/ScatterLayers';
import { ScatterInstances } from '../lib/renderers/terrain/Scatter';
import { Transform } from '../lib/core/Transform';
import { NUM_CASCADES } from '../lib/renderers/shadow/DirectionalShadowRenderer';
import { shadowConfig } from '../lib/renderers/shadow/ShadowQuality';
import { SceneBVH } from '../lib/acceleration/SceneBVH';
import { TerrainRenderer } from '../lib/renderers/terrain/TerrainRenderer';
import { WATER_MAP_STEP } from '../lib/renderers/terrain/WaterMap';
import { OCEAN_WATER } from '../lib/renderers/terrain/Water';
import { ShoreField } from '../lib/renderers/water/ShoreField';
import { WaterLevelField } from '../lib/renderers/water/WaterLevelField';
import { runBenchmarks } from './harness';

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

/** Metres a chunk spans. Mirrors TerrainRenderer.chunkSize. */
const CHUNK_METRES = (CHUNK_SIZE - 1) * TERRAIN_METERS_PER_SAMPLE;

/** Metres a scatter model reaches from its origin, for the cell bounds. */
const SCATTER_MODEL_REACH = 5;

const IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

/**
 * The draws ChunkScatter.build makes over a chunk's instances: one per layer
 * tier, the impostor included, each with one primitive. The real build takes
 * the primitives from GPU models, which the benchmark has none of.
 */
function scatterLayers(
  scatter: ChunkScatter,
  instances: ScatterInstances[]
): ScatterChunkLayer[] {
  const layers: ScatterChunkLayer[] = [];
  for (const list of instances) {
    if (list.count === 0) continue;
    const layer = getScatterLayer(list.layer);
    for (let tier = 0; tier < lodTierCount(layer); tier++) {
      const transform = scatter['attach'](list.layer);
      layers.push(
        new ScatterChunkLayer(
          transform,
          new Geometry(),
          {} as never,
          IDENTITY_MATRIX,
          list,
          layer,
          tier,
          0,
          SCATTER_MODEL_REACH
        )
      );
    }
  }
  return layers;
}

/** A chunk holding scatter, at its world position. */
interface ScatterChunk {
  transform: Transform;
  instances: ScatterInstances[];
  scatter: ChunkScatter;
  layers: ScatterChunkLayer[];
}

/** Every chunk that holds scatter around a viewer at the origin, under one
 *  scene root. */
function scatterWorld(): { root: Transform; chunks: ScatterChunk[] } {
  const reach = getScatterGenerationDistance();
  const rings = Math.ceil(reach / CHUNK_METRES) + 1;
  // The scene root, which Renderer composes by hand.
  const root = new Transform();
  root.matrixAutoUpdate = false;
  const chunks: ScatterChunk[] = [];
  for (let cy = -rings; cy <= rings; cy++)
    for (let cx = -rings; cx <= rings; cx++) {
      const ex = Math.max(Math.abs(cx * CHUNK_METRES) - CHUNK_METRES / 2, 0);
      const ez = Math.max(Math.abs(cy * CHUNK_METRES) - CHUNK_METRES / 2, 0);
      if (Math.hypot(ex, ez) > reach) continue;

      const { scatter: instances } = buildChunkMesh({
        ...chunkRequest(LODS[LODS.length - 1], 0),
        position: { x: cx * (CHUNK_SIZE - 1), y: cy * (CHUNK_SIZE - 1) },
        scatter: true,
      });
      // Placed as TerrainChunk places its transform.
      const transform = new Transform();
      transform.position.set(cx * CHUNK_METRES, 0, cy * CHUNK_METRES);
      transform.matrixAutoUpdate = false;
      transform.updateMatrix();
      root.addChild(transform);
      const scatter = new ChunkScatter(transform);
      const layers = scatterLayers(scatter, instances);
      (scatter as unknown as { layers: ScatterChunkLayer[] }).layers = layers;
      chunks.push({ transform, instances, scatter, layers });
    }
  root.updateMatrixWorld(true);

  const draws = chunks.reduce((n, c) => n + c.layers.length, 0);
  process.stderr.write(
    `  ${chunks.length} chunks with scatter, ${draws} layer tiers
`
  );
  return { root, chunks };
}

/** The frustum of a camera at `eye` looking along +x. */
function viewFrustum(eye: Vector3): Frustum {
  const camera = new Matrix4()
    .lookAt(eye, new Vector3(eye.x + 1, eye.y, eye.z), new Vector3(0, 1, 0))
    .setPosition(eye.x, eye.y, eye.z);
  const near = 0.1;
  const halfHeight = near * Math.tan(Math.PI / 6);
  const halfWidth = halfHeight * (16 / 9);
  const projection = new Matrix4().makePerspective(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    near,
    10000
  );
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(projection, camera.clone().invert())
  );
}

/** A device that takes texture uploads and drops them. Node has no WebGPU, so
 *  the usage flags textures are created with are stood in for too. */
(globalThis as Record<string, unknown>).GPUTextureUsage ??= {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};
const STUB_DEVICE = {
  createTexture: () => ({ destroy() {}, createView: () => ({}) }),
  queue: { writeTexture() {} },
} as unknown as GPUDevice;

/** Runs `frame` until `done`, timing the whole and the slowest frame. */
function timeFrames(done: () => boolean, frame: () => void) {
  let total = 0;
  let worst = 0;
  for (let i = 0; i < 100 && !done(); i++) {
    const started = performance.now();
    frame();
    const spent = performance.now() - started;
    total += spent;
    worst = Math.max(worst, spent);
  }
  return { total, frame: worst };
}

/**
 * The 5 × 5 chunks around the first chunk, searching outward from the origin,
 * whose ground crosses sea level, held by a TerrainRenderer with only their
 * heights and water maps. The real one needs a GPU device to build.
 */
function coastWorld() {
  const climate = resolveClimatePreset(DEFAULT_CLIMATE_PRESET);
  const build = (cx: number, cy: number) =>
    buildChunkMesh({
      ...chunkRequest(LODS[LODS.length - 1], 0),
      position: { x: cx * (CHUNK_SIZE - 1), y: cy * (CHUNK_SIZE - 1) },
    });

  let centre: { cx: number; cy: number } | undefined;
  for (let ring = 0; !centre && ring <= 40; ring += 4)
    for (let cy = -ring; !centre && cy <= ring; cy += 4)
      for (let cx = -ring; !centre && cx <= ring; cx += 4) {
        if (Math.max(Math.abs(cx), Math.abs(cy)) !== ring) continue;
        const { heights } = build(cx, cy);
        let low = Infinity;
        let high = -Infinity;
        for (const h of heights) {
          low = Math.min(low, h);
          high = Math.max(high, h);
        }
        if (low < 0 && high > 0) centre = { cx, cy };
      }
  if (!centre) throw new Error('No coast within 40 chunks of the origin.');

  const terrainChunks = new Map<string, unknown>();
  for (let cy = centre.cy - 2; cy <= centre.cy + 2; cy++)
    for (let cx = centre.cx - 2; cx <= centre.cx + 2; cx++) {
      const { heights, water } = build(cx, cy);
      terrainChunks.set(`${cx},${cy}`, { heights, water });
    }
  const palette = climate.water ?? [];
  const terrain: TerrainRenderer = Object.assign(
    Object.create(TerrainRenderer.prototype),
    {
      chunkSize: CHUNK_METRES,
      mapChunkSizeLod: CHUNK_SIZE,
      terrainChunks,
      _seaLevel: 0,
      oceanType: palette.findIndex((w) => w.name === OCEAN_WATER),
    }
  );
  process.stderr.write(`  coast at chunk (${centre.cx}, ${centre.cy})
`);
  return {
    terrain,
    palette,
    x: centre.cx * CHUNK_METRES,
    z: centre.cy * CHUNK_METRES,
  };
}

const timeChunk = (request: BuildChunkMeshRequest) => {
  const timings: ChunkMeshTimings = {};
  buildChunkMesh(request, timings);
  return timings as Record<string, number>;
};

await runBenchmarks((bench) => {
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

  // Scatter on the main thread. A chunk's draws are built once, when its
  // instances arrive. Every frame the camera moves, each chunk culls its
  // layers by distance. The scene pass selects cells from each layer left
  // whose bounds meet the frustum, as the scene BVH culls them, and every
  // shadow cascade from each caster within the ultra tier's shadow range. A
  // caster reaches only some cascades, and the far one draws every other
  // frame, so the shadow stage is an upper bound.
  const shadowFar = shadowConfig('ultra').shadowFar;
  let scatterScene: ReturnType<typeof scatterWorld> | undefined;
  const scatterFixture = () => (scatterScene ??= scatterWorld()).chunks;
  bench('scatter chunk build', (i) => {
    const near = scatterFixture().slice(0, POSITIONS.length);
    const chunk = near[i % near.length];
    const scatter = new ChunkScatter(new Transform());
    const started = performance.now();
    scatterLayers(scatter, chunk.instances);
    return { total: performance.now() - started };
  });
  bench('scatter cull frame', (i) => {
    const chunks = scatterFixture();
    const eye = new Vector3(i * 3, 30, 0);
    const frustum = viewFrustum(eye);
    const local = new Vector3();
    const bounds = new Box3();

    const started = performance.now();
    for (const chunk of chunks) chunk.scatter.updateVisibility(eye, 0);
    const culled = performance.now();
    for (const chunk of chunks) {
      local.copy(eye).sub(chunk.transform.position);
      for (const layer of chunk.layers) {
        if (!layer.visible) continue;
        bounds.copy(layer.localBounds).translate(chunk.transform.position);
        if (!frustum.intersectsBox(bounds)) continue;
        layer.selectInstances(local, frustum);
      }
    }
    const scene = performance.now();
    for (const chunk of chunks) {
      local.copy(eye).sub(chunk.transform.position);
      for (const layer of chunk.layers) {
        if (!layer.visible || !layer.castShadow) continue;
        bounds.copy(layer.localBounds).translate(chunk.transform.position);
        if (bounds.distanceToPoint(eye) > shadowFar) continue;
        for (let c = 0; c < NUM_CASCADES; c++)
          layer.selectInstances(local, frustum, true);
      }
    }
    const shadow = performance.now();
    return {
      visibility: culled - started,
      scene: scene - culled,
      shadow: shadow - scene,
    };
  });

  // The scene graph over the same chunks. Every frame updates the world
  // matrices from the root, and a change to the scene's structure, such as a
  // chunk swapping its mesh, rebuilds the scene BVH.
  bench('scene matrices', () => {
    scatterFixture();
    const { root } = scatterScene!;
    const started = performance.now();
    root.updateMatrixWorld();
    return { total: performance.now() - started };
  });
  let sceneBVH: SceneBVH | undefined;
  bench('scene bvh rebuild', () => {
    scatterFixture();
    sceneBVH ??= new SceneBVH(scatterScene!.root);
    const started = performance.now();
    sceneBVH.rebuild();
    return { total: performance.now() - started };
  });

  bench('scene bvh cull', (i) => {
    scatterFixture();
    sceneBVH ??= new SceneBVH(scatterScene!.root);
    sceneBVH.update();
    const frustum = viewFrustum(new Vector3(i * 3, 30, 0));
    const visible: Transform[] = [];
    const started = performance.now();
    sceneBVH.frustumCull(frustum, visible);
    return { total: performance.now() - started };
  });

  // The water fields around the camera, rebuilt a few rows a frame at a coast.
  // `total` is the whole rebuild and `frame` its most expensive frame.
  let coast: ReturnType<typeof coastWorld> | undefined;
  const coastFixture = () => (coast ??= coastWorld());
  bench('water shore field', () => {
    const { terrain, x, z } = coastFixture();
    const sample = terrain['sampleOceanDepth'].bind(terrain);
    const field = new ShoreField(STUB_DEVICE);
    return timeFrames(
      () => field['built'],
      () => {
        terrain['resetOceanCache']();
        field.update(STUB_DEVICE, 1 / 60, x, z, sample);
      }
    );
  });
  bench('water level field', () => {
    const { terrain, x, z, palette } = coastFixture();
    const waterMapAt = terrain.waterMapAt.bind(terrain);
    const field = new WaterLevelField();
    const texels = (CHUNK_SIZE - 1) / WATER_MAP_STEP;
    return timeFrames(
      () => field.built,
      () => field.update(STUB_DEVICE, 1 / 60, x, z, texels, waterMapAt, palette)
    );
  });

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
});
