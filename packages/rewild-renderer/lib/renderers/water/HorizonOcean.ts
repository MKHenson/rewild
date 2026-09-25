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
}

// Everything from the last terrain chunk to the horizon: open sea, and the
// land beyond the chunks drawn flat in its biome's far colour.
export class HorizonOcean {
  readonly mesh: HorizonMesh;
  private readonly pass: HorizonOceanPass;
  private readonly near: FarMapLevel;
  private readonly wide: FarMapLevel;
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

    this.pass = new HorizonOceanPass();
    this.pass.horizonUniforms.setMaps(this.near.texture, this.wide.texture);
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

    this.pass.horizonUniforms.params = {
      centreX,
      centreZ,
      maxViewDst: state.maxViewDst,
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
      scatter: hasOcean ? climate.water![oceanType].scatter : NO_SCATTER,
    };
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.transform.removeFromParent();
    this.pass.dispose();
    this.mesh.geometry.dispose();
    this.near.dispose();
    this.wide.dispose();
  }
}
