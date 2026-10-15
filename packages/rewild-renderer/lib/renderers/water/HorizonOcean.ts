import { Box3 } from 'rewild-common';
import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';
import { Geometry } from '../../geometry/Geometry';
import { HorizonOceanPass } from '../../materials/HorizonOceanPass';
import { WATER_ROUGHNESS } from '../../materials/uniforms/WaterUniforms';
import { ClimateConfig, MAX_SPLAT_LAYERS } from '../terrain/Biomes';
import {
  TERRAIN_ALBEDO_ARRAY,
  TERRAIN_ARM_ARRAY,
  TERRAIN_NORMAL_ARRAY,
  getClimateLayerParams,
} from '../terrain/TerrainTextureArrays';
import {
  getTerrainMaterial,
  getTerrainMaterialLayer,
} from '../terrain/TerrainMaterials';
import { OCEAN_WATER, getWaterTypeIndex } from '../terrain/Water';
import { WATER_INTERACTION_LAYER } from './ChunkWater';
import {
  FAR_MAP_TEXELS,
  FarMapBuilder,
  NEAR_FAR_MAP_SPAN,
  NEAR_FAR_MAP_TEXELS,
  WIDE_FAR_MAP_SPAN,
} from './HorizonCoverage';

// Spokes around the ring: fine enough that a far peak keeps its shape.
const RING_SEGMENTS = 1024;
// Finite rings out to OUTER_RADIUS. Geometric spacing puts them about 120 m
// apart at the edge of the near far map, about two of its texels.
const RING_BANDS = 192;

/** Metres from the centre of the last finite ring; flat sea level beyond. */
const OUTER_RADIUS = 24000;
/** Metres from the centre the land starts flattening to sea level. Haze has
 *  hidden most of it by here. */
const FADE_START = 16000;

// The material whose normal and occlusion are tiled over all the far ground,
// at the size the chunks tile it as macro relief, for relief finer than the far
// map's heights.
const DETAIL_MATERIAL = 'marble_cliff_05';
const DETAIL_TILE = 160;
const DETAIL_STRENGTH = 1;
const DETAIL_LAYER = getTerrainMaterialLayer(DETAIL_MATERIAL);
const DETAIL_Y_SIGN =
  getTerrainMaterial(DETAIL_MATERIAL).normalConvention === 'opengl' ? -1 : 1;

// Time spent per frame per level on a background far map rebuild. Rows cost
// about 1 ms per 256 texels, so this is at least one row.
const REBUILD_BUDGET_MS = 1;

const NO_SCATTER: readonly [number, number, number] = [0, 0, 0];

/** Chunks per side of the chunk mask, centred on the visibility centre's
 *  chunk. Covers every chunk the terrain can draw. */
export const CHUNK_MASK_SIZE = 16;
/** How many chunks inside the view distance the ring starts, so it fills
 *  chunks in range that have not meshed yet. */
const FILL_CHUNKS = 3;

// Mean square slope of a wind sea (Cox and Munk): a + b * wind speed. Mirrors
// MSS_BASE and MSS_PER_WIND in water.wgsl.
const MSS_BASE = 0.003;
const MSS_PER_WIND = 0.00512;

/** Mean square slope of the ocean in a wind of `windSpeed` m/s. */
export function oceanSlopeVariance(windSpeed: number): number {
  return MSS_BASE + MSS_PER_WIND * Math.max(0, windSpeed);
}

/** Index into a chunk mask for chunk (x, z) around `origin`, or -1 off it. */
export function chunkMaskIndex(
  x: number,
  z: number,
  originX: number,
  originZ: number
): number {
  const half = CHUNK_MASK_SIZE / 2;
  const i = x - originX + half;
  const j = z - originZ + half;
  if (i < 0 || j < 0 || i >= CHUNK_MASK_SIZE || j >= CHUNK_MASK_SIZE)
    return -1;
  return j * CHUNK_MASK_SIZE + i;
}

/** Radial parameter of the ring vertices at infinity. */
export const INFINITE_EDGE = 2;

/**
 * A polar grid of `segments` spokes crossing `bands` finite rings, then one
 * more ring at infinity. Each vertex is (direction x, direction z, radial
 * parameter): 0 to 1 from the inner to the outer finite ring, INFINITE_EDGE on
 * the last. Vertices run ring by ring, `segments + 1` to a ring so it closes.
 *
 * Triangles are ordered inner ring first. The ring writes one depth everywhere,
 * so the first surface drawn on a pixel keeps it: drawing outward lets nearer
 * ground hide farther ground.
 */
export function buildHorizonRing(
  segments: number = RING_SEGMENTS,
  bands: number = RING_BANDS
): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const spokes = segments + 1;
  const rings = bands + 2;
  const vertices = new Float32Array(spokes * rings * 3);
  const indices = new Uint32Array(segments * (rings - 1) * 6);
  for (let k = 0; k < rings; k++) {
    const s = k <= bands ? k / bands : INFINITE_EDGE;
    for (let i = 0; i < spokes; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const v = (k * spokes + i) * 3;
      vertices[v] = Math.cos(angle);
      vertices[v + 1] = Math.sin(angle);
      vertices[v + 2] = s;
    }
  }
  let t = 0;
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < segments; i++) {
      const inner = k * spokes + i;
      const next = inner + 1;
      const outer = inner + spokes;
      const outerNext = outer + 1;
      indices[t++] = inner;
      indices[t++] = next;
      indices[t++] = outer;
      indices[t++] = outer;
      indices[t++] = next;
      indices[t++] = outerNext;
    }
  }
  return { vertices, indices };
}

class HorizonMesh extends Mesh {
  // The ring is placed and sized in its vertex shader, so it states its bounds.
  localBounds = new Box3();
}

// One level of the far map: textures that follow the chunks' visibility centre,
// rebuilt in the background once the centre has drifted far enough or the sea
// level has moved.
class FarMapLevel {
  readonly weights: GPUTexture;
  readonly ground: GPUTexture;
  centreX = 0;
  centreZ = 0;
  private seaLevel = 0;
  private pending: FarMapBuilder | null = null;

  constructor(
    renderer: Renderer,
    label: string,
    readonly span: number,
    private readonly texels: number,
    private readonly rebuildDistance: number
  ) {
    this.weights = renderer.device.createTexture({
      label: `${label}-weights`,
      size: [texels, texels, MAX_SPLAT_LAYERS / 4],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.ground = renderer.device.createTexture({
      label: `${label}-ground`,
      size: [texels, texels],
      format: 'rg16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  /** Builds the map around (x, z) now, dropping any rebuild in flight. */
  rebuildNow(
    renderer: Renderer,
    seed: number,
    climate: ClimateConfig,
    seaLevel: number,
    x: number,
    z: number
  ) {
    this.pending = this.builder(seed, climate, seaLevel, x, z);
    this.pending.build();
    this.commit(renderer);
  }

  /**
   * Advances the background rebuild, starting one if the map is stale. Returns
   * whether any rebuild work ran.
   */
  follow(
    renderer: Renderer,
    seed: number,
    climate: ClimateConfig,
    seaLevel: number,
    x: number,
    z: number
  ): boolean {
    const drifted =
      !this.pending &&
      Math.hypot(x - this.centreX, z - this.centreZ) > this.rebuildDistance;
    if (drifted || seaLevel !== this.seaLevel)
      this.pending = this.builder(seed, climate, seaLevel, x, z);
    if (!this.pending) return false;

    const start = performance.now();
    while (!this.pending.build(1)) {
      if (performance.now() - start >= REBUILD_BUDGET_MS) return true;
    }
    this.commit(renderer);
    return true;
  }

  private builder(
    seed: number,
    climate: ClimateConfig,
    seaLevel: number,
    x: number,
    z: number
  ) {
    this.seaLevel = seaLevel;
    // Snapped to whole texels so the map does not swim as it follows.
    const texel = this.span / this.texels;
    return new FarMapBuilder(
      seed,
      climate,
      Math.round(x / texel) * texel,
      Math.round(z / texel) * texel,
      this.span,
      this.texels,
      seaLevel
    );
  }

  private commit(renderer: Renderer) {
    const built = this.pending!;
    const texels = this.texels;
    renderer.device.queue.writeTexture(
      { texture: this.weights },
      built.weights as BufferSource,
      { bytesPerRow: texels * 4, rowsPerImage: texels },
      { width: texels, height: texels, depthOrArrayLayers: MAX_SPLAT_LAYERS / 4 }
    );
    renderer.device.queue.writeTexture(
      { texture: this.ground },
      built.ground as BufferSource,
      { bytesPerRow: texels * 4 },
      { width: texels, height: texels }
    );
    this.centreX = built.centreX;
    this.centreZ = built.centreZ;
    this.pending = null;
  }

  dispose() {
    this.weights.destroy();
    this.ground.destroy();
  }
}

export interface HorizonOceanState {
  seed: number;
  climatePreset: string;
  climate: ClimateConfig;
  seaLevel: number;
  /** The chunks' visibility centre, world x and z. */
  centreX: number;
  centreZ: number;
  maxViewDst: number;
  chunkSize: number;
  /** 255 where a chunk drew this frame (chunkMaskIndex), centred on the
   *  centre's chunk. */
  chunkMask: Uint8Array;
  /** The ocean's wind speed in m/s. */
  windSpeed: number;
  /** Scale on the far sea's slope variance; 1 matches the chunk water. */
  slopeScale: number;
}

// Everything from the last terrain chunk to the horizon: open sea, and the
// land beyond the chunks at its generated height, surfaced in the average
// colours of the materials the chunks' splat rules would put there.
export class HorizonOcean {
  readonly mesh: HorizonMesh;
  private readonly pass: HorizonOceanPass;
  private readonly near: FarMapLevel;
  private readonly wide: FarMapLevel;
  private readonly chunkMask: GPUTexture;
  private readonly uploadedMask = new Uint8Array(
    CHUNK_MASK_SIZE * CHUNK_MASK_SIZE
  );
  private maskUploaded = false;
  private worldKey = '';
  private paletteClimate: ClimateConfig | null = null;
  private readonly paletteLayers = new Array<number>(MAX_SPLAT_LAYERS).fill(0);

  constructor(renderer: Renderer) {
    const ring = buildHorizonRing();
    const geometry = new Geometry();
    geometry.vertices = ring.vertices;
    geometry.indices = ring.indices;
    geometry.autoComputeBVH = false;

    // Each level rebuilds once the centre is an eighth of its span away, so
    // while the rebuild runs it still reaches past the far plane (near) or to
    // within a pixel or two of the horizon (wide).
    this.near = new FarMapLevel(
      renderer,
      'far-map-near',
      NEAR_FAR_MAP_SPAN,
      NEAR_FAR_MAP_TEXELS,
      NEAR_FAR_MAP_SPAN / 8
    );
    this.wide = new FarMapLevel(
      renderer,
      'far-map-wide',
      WIDE_FAR_MAP_SPAN,
      FAR_MAP_TEXELS,
      WIDE_FAR_MAP_SPAN / 8
    );

    this.chunkMask = renderer.device.createTexture({
      label: 'horizon-chunk-mask',
      size: [CHUNK_MASK_SIZE, CHUNK_MASK_SIZE],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.pass = new HorizonOceanPass();
    this.pass.horizonUniforms.setMaps(
      this.near.weights,
      this.wide.weights,
      this.near.ground,
      this.wide.ground,
      this.chunkMask
    );
    this.mesh = new HorizonMesh(geometry, this.pass);
    this.mesh.localBounds.min.set(-1e7, -1e4, -1e7);
    this.mesh.localBounds.max.set(1e7, 1e4, 1e7);
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    this.mesh.transform.layers.set(WATER_INTERACTION_LAYER);
    renderer.scene.addChild(this.mesh.transform);
  }

  hide() {
    this.mesh.visible = false;
  }

  update(renderer: Renderer, state: HorizonOceanState) {
    const { climate, seed, seaLevel, centreX, centreZ } = state;

    const textures = renderer.textureManager.textures;
    const albedo = textures.get(TERRAIN_ALBEDO_ARRAY);
    const normal = textures.get(TERRAIN_NORMAL_ARRAY);
    const arm = textures.get(TERRAIN_ARM_ARRAY);
    if (!albedo || !normal || !arm) {
      this.mesh.visible = false;
      return;
    }
    this.pass.horizonUniforms.setMaterials(
      albedo.gpuTexture,
      normal.gpuTexture,
      arm.gpuTexture
    );

    const rebuildStart = performance.now();
    let rebuilt = true;
    const key = `${seed}|${state.climatePreset}`;
    if (key !== this.worldKey) {
      this.near.rebuildNow(renderer, seed, climate, seaLevel, centreX, centreZ);
      this.wide.rebuildNow(renderer, seed, climate, seaLevel, centreX, centreZ);
      this.worldKey = key;
    } else {
      const near = this.near.follow(renderer, seed, climate, seaLevel, centreX, centreZ);
      const wide = this.wide.follow(renderer, seed, climate, seaLevel, centreX, centreZ);
      rebuilt = near || wide;
    }
    // Only frames that rebuilt, so the panel's duty is how often it happens.
    if (rebuilt)
      renderer.metrics.record('cpu.farmap', performance.now() - rebuildStart);

    if (climate !== this.paletteClimate) {
      const layers = getClimateLayerParams(climate);
      for (let c = 0; c < MAX_SPLAT_LAYERS; c++)
        this.paletteLayers[c] = layers[c]?.layerIndex ?? 0;
      this.paletteClimate = climate;
    }

    // Without a continent or an ocean type, the ring is all land.
    const continent = climate.continent;
    const oceanType = getWaterTypeIndex(climate, OCEAN_WATER);
    const hasOcean = !!continent && oceanType >= 0;

    this.uploadMask(renderer, state.chunkMask);

    const atmosphere =
      renderer.sky?.skyRenderer?.finalPass?.uniformBuffer ?? null;
    this.pass.horizonUniforms.setAtmosphere(atmosphere);

    this.pass.horizonUniforms.params = {
      centreX,
      centreZ,
      innerRadius: Math.max(
        0,
        state.maxViewDst - FILL_CHUNKS * state.chunkSize
      ),
      chunkSize: state.chunkSize,
      nearCentreX: this.near.centreX,
      nearCentreZ: this.near.centreZ,
      nearSpan: this.near.span,
      wideCentreX: this.wide.centreX,
      wideCentreZ: this.wide.centreZ,
      wideSpan: this.wide.span,
      seaLevel: state.seaLevel,
      roughness: WATER_ROUGHNESS,
      coast: hasOcean ? continent!.coast : -2,
      blendHalfWidth: hasOcean ? continent!.blendHalfWidth : 0.01,
      maskOriginX: Math.round(centreX / state.chunkSize),
      maskOriginZ: Math.round(centreZ / state.chunkSize),
      scatter: hasOcean ? climate.water![oceanType].scatter : NO_SCATTER,
      slopeVariance: oceanSlopeVariance(state.windSpeed) * state.slopeScale,
      outerRadius: OUTER_RADIUS,
      fadeStart: FADE_START,
      fogged: !!atmosphere,
      paletteLayers: this.paletteLayers,
      detailLayer: DETAIL_LAYER,
      detailYSign: DETAIL_Y_SIGN,
      detailTile: DETAIL_TILE,
      detailStrength: DETAIL_STRENGTH,
    };
    this.mesh.visible = true;
  }

  private uploadMask(renderer: Renderer, mask: Uint8Array) {
    const uploaded = this.uploadedMask;
    let changed = !this.maskUploaded;
    for (let i = 0; i < uploaded.length && !changed; i++)
      changed = uploaded[i] !== mask[i];
    if (!changed) return;
    uploaded.set(mask);
    this.maskUploaded = true;
    renderer.device.queue.writeTexture(
      { texture: this.chunkMask },
      uploaded as BufferSource,
      { bytesPerRow: CHUNK_MASK_SIZE },
      { width: CHUNK_MASK_SIZE, height: CHUNK_MASK_SIZE }
    );
  }

  dispose() {
    this.mesh.transform.removeFromParent();
    this.pass.dispose();
    this.chunkMask.destroy();
    this.mesh.geometry.dispose();
    this.near.dispose();
    this.wide.dispose();
  }
}
