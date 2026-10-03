import { Box3 } from 'rewild-common';
import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';
import { Geometry } from '../../geometry/Geometry';
import { HorizonOceanPass } from '../../materials/HorizonOceanPass';
import { WATER_ROUGHNESS } from '../../materials/uniforms/WaterUniforms';
import { ClimateConfig } from '../terrain/Biomes';
import { OCEAN_WATER, getWaterTypeIndex } from '../terrain/Water';
import { WATER_INTERACTION_LAYER } from './ChunkWater';
import {
  FAR_MAP_TEXELS,
  FarMapBuilder,
  NEAR_FAR_MAP_SPAN,
  WIDE_FAR_MAP_SPAN,
} from './HorizonCoverage';

const RING_SEGMENTS = 256;

// Far map rows built per frame while a level rebuilds in the background, at
// about 0.1 ms a row.
const ROWS_PER_FRAME = 4;

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

/**
 * A ring of `segments` quads. Each vertex is (direction x, direction z, edge):
 * edge 0 is the inner radius, edge 1 is infinity.
 */
export function buildHorizonRing(segments: number = RING_SEGMENTS): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const vertices = new Float32Array((segments + 1) * 2 * 3);
  const indices = new Uint32Array(segments * 6);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    vertices.set([x, z, 0, x, z, 1], i * 6);
  }
  for (let i = 0; i < segments; i++) {
    const inner = i * 2;
    const next = inner + 2;
    indices.set([inner, next, inner + 1, inner + 1, next, next + 1], i * 6);
  }
  return { vertices, indices };
}

class HorizonMesh extends Mesh {
  // The ring is placed and sized in its vertex shader, so it states its bounds.
  localBounds = new Box3();
}

// One level of the far map: a texture that follows the chunks' visibility
// centre, rebuilt in the background once the centre has drifted far enough.
class FarMapLevel {
  readonly texture: GPUTexture;
  centreX = 0;
  centreZ = 0;
  private pending: FarMapBuilder | null = null;

  constructor(
    renderer: Renderer,
    label: string,
    readonly span: number,
    private readonly rebuildDistance: number
  ) {
    this.texture = renderer.device.createTexture({
      label,
      size: [FAR_MAP_TEXELS, FAR_MAP_TEXELS],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
  }

  /** Builds the map around (x, z) now, dropping any rebuild in flight. */
  rebuildNow(renderer: Renderer, seed: number, climate: ClimateConfig, x: number, z: number) {
    this.pending = this.builder(seed, climate, x, z);
    this.pending.build();
    this.commit(renderer);
  }

  /** Advances the background rebuild, starting one if the centre drifted. */
  follow(renderer: Renderer, seed: number, climate: ClimateConfig, x: number, z: number) {
    if (
      !this.pending &&
      Math.hypot(x - this.centreX, z - this.centreZ) > this.rebuildDistance
    )
      this.pending = this.builder(seed, climate, x, z);

    if (this.pending?.build(ROWS_PER_FRAME)) this.commit(renderer);
  }

  private builder(seed: number, climate: ClimateConfig, x: number, z: number) {
    // Snapped to whole texels so the map does not swim as it follows.
    const texel = this.span / FAR_MAP_TEXELS;
    return new FarMapBuilder(
      seed,
      climate,
      Math.round(x / texel) * texel,
      Math.round(z / texel) * texel,
      this.span
    );
  }

  private commit(renderer: Renderer) {
    const built = this.pending!;
    renderer.device.queue.writeTexture(
      { texture: this.texture },
      built.data as BufferSource,
      { bytesPerRow: FAR_MAP_TEXELS * 8 },
      { width: FAR_MAP_TEXELS, height: FAR_MAP_TEXELS }
    );
    this.centreX = built.centreX;
    this.centreZ = built.centreZ;
    this.pending = null;
  }

  dispose() {
    this.texture.destroy();
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
// land beyond the chunks drawn flat in its biome's far colour.
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
      NEAR_FAR_MAP_SPAN / 8
    );
    this.wide = new FarMapLevel(
      renderer,
      'far-map-wide',
      WIDE_FAR_MAP_SPAN,
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
      this.near.texture,
      this.wide.texture,
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
    const { climate, seed, centreX, centreZ } = state;

    const key = `${seed}|${state.climatePreset}`;
    if (key !== this.worldKey) {
      this.near.rebuildNow(renderer, seed, climate, centreX, centreZ);
      this.wide.rebuildNow(renderer, seed, climate, centreX, centreZ);
      this.worldKey = key;
    } else {
      this.near.follow(renderer, seed, climate, centreX, centreZ);
      this.wide.follow(renderer, seed, climate, centreX, centreZ);
    }

    // Without a continent or an ocean type, the ring is all land.
    const continent = climate.continent;
    const oceanType = getWaterTypeIndex(climate, OCEAN_WATER);
    const hasOcean = !!continent && oceanType >= 0;

    this.uploadMask(renderer, state.chunkMask);

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
