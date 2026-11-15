import { Box3 } from 'rewild-common';
import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';
import { Geometry } from '../../geometry/Geometry';
import { FarSpriteDraw, FarSpritePass } from '../../materials/FarSpritePass';
import {
  HORIZON_PARAMS_FLOATS,
  HorizonParams,
  packHorizonParams,
} from '../../materials/uniforms/HorizonUniforms';
import { FarMapBuilder } from '../water/FarMapBuilder';
import {
  getScatterLayer,
  getScatterLayerOrder,
  lodFadeHalfWidth,
} from './ScatterLayers';

const FLOATS_PER_SPRITE = 4;
const SPRITE_LAYER_FLOATS = 4;
// Stands in for the atmosphere composite's uniforms when there is no sky.
const ATMOSPHERE_FALLBACK_BYTES = 256;

class FarSpriteMesh extends Mesh {
  // Placed in the vertex shader, out to the far ground.
  localBounds = new Box3();
}

function billboard(): Geometry {
  const quad = new Geometry();
  quad.vertices = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  quad.uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  quad.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  quad.autoComputeBVH = false;
  return quad;
}

interface SpriteLayerState {
  name: string;
  first: number;
  count: number;
  uniform: GPUBuffer;
}

/**
 * The far sprite layers' trees past the chunks: every instance the near far
 * map places, drawn as its layer's impostor (FarSpritePass) out to where the
 * map's sprites thin away.
 */
export class FarSprites {
  readonly mesh: FarSpriteMesh;
  private readonly pass: FarSpritePass;
  private readonly horizonParams: GPUBuffer;
  private readonly horizonData = new Float32Array(HORIZON_PARAMS_FLOATS);
  private atmosphereFallback: GPUBuffer | null = null;
  private instances: GPUBuffer | null = null;
  private layers: SpriteLayerState[] = [];
  // What the pass's bind groups were built over.
  private boundInstances: GPUBuffer | null = null;
  private boundChunkMask: GPUTexture | null = null;
  private boundNearGround: GPUTexture | null = null;
  private boundWideGround: GPUTexture | null = null;
  private boundAtmosphere: GPUBuffer | null = null;

  constructor(renderer: Renderer) {
    this.pass = new FarSpritePass();
    this.mesh = new FarSpriteMesh(billboard(), this.pass);
    this.mesh.localBounds.min.set(-1e7, -1e4, -1e7);
    this.mesh.localBounds.max.set(1e7, 1e4, 1e7);
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    this.horizonParams = renderer.device.createBuffer({
      label: 'far sprite horizon params',
      size: HORIZON_PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    renderer.scene.addChild(this.mesh.transform);
  }

  /** Takes the instances a near far map placed, replacing the last map's. */
  setInstances(renderer: Renderer, built: FarMapBuilder) {
    const { device } = renderer;
    const data = built.sprites;
    if (!this.instances || this.instances.size < data.byteLength) {
      this.instances?.destroy();
      this.instances = device.createBuffer({
        label: 'far sprite instances',
        size: Math.max(data.byteLength, FLOATS_PER_SPRITE * 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    if (data.byteLength > 0)
      device.queue.writeBuffer(this.instances, 0, data as BufferSource);

    const order = getScatterLayerOrder();
    const previous = this.layers;
    this.layers = [];
    let first = 0;
    for (let i = 0; i < built.spriteSlots.length; i++) {
      const name = order[built.spriteSlots[i]];
      const count = built.spriteCounts[i];
      const reused = previous.find((l) => l.name === name);
      const uniform =
        reused?.uniform ??
        device.createBuffer({
          label: `far sprite layer ${name}`,
          size: SPRITE_LAYER_FLOATS * 4,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      const cull = getScatterLayer(name).cullDistance;
      device.queue.writeBuffer(
        uniform,
        0,
        new Float32Array([cull - 2 * lodFadeHalfWidth(cull), cull, 0, 0])
      );
      this.layers.push({ name, first, count, uniform });
      first += count;
    }
    for (const layer of previous)
      if (!this.layers.some((l) => l.uniform === layer.uniform))
        layer.uniform.destroy();
    this.boundInstances = null;
  }

  /**
   * Follows the far ground the ring draws this frame: its parameters, chunk
   * mask and far map grounds, and the atmosphere composite's uniforms, null
   * without a sky.
   */
  update(
    renderer: Renderer,
    params: HorizonParams,
    chunkMask: GPUTexture,
    nearGround: GPUTexture,
    wideGround: GPUTexture,
    sky: GPUBuffer | null
  ) {
    if (!this.instances || this.layers.length === 0) {
      this.mesh.visible = false;
      return;
    }

    packHorizonParams(params, this.horizonData);
    renderer.device.queue.writeBuffer(this.horizonParams, 0, this.horizonData);

    if (!sky)
      this.atmosphereFallback ??= renderer.device.createBuffer({
        label: 'far sprite atmosphere fallback',
        size: ATMOSPHERE_FALLBACK_BYTES,
        usage: GPUBufferUsage.UNIFORM,
      });
    const atmosphere = sky ?? this.atmosphereFallback!;

    if (
      this.boundInstances !== this.instances ||
      this.boundChunkMask !== chunkMask ||
      this.boundNearGround !== nearGround ||
      this.boundWideGround !== wideGround ||
      this.boundAtmosphere !== atmosphere
    ) {
      this.boundInstances = this.instances;
      this.boundChunkMask = chunkMask;
      this.boundNearGround = nearGround;
      this.boundWideGround = wideGround;
      this.boundAtmosphere = atmosphere;
      const models = renderer.terrainRenderer.scatterModels;
      const draws: FarSpriteDraw[] = [];
      for (const layer of this.layers) {
        const impostor = models.impostor(renderer, layer.name);
        if (!impostor) continue;
        draws.push({
          first: layer.first,
          count: layer.count,
          atlas: impostor.pass.atlas,
          uniform: layer.uniform,
        });
      }
      this.pass.setDraws(draws, {
        instances: this.instances,
        horizonParams: this.horizonParams,
        chunkMask,
        nearGround,
        wideGround,
        atmosphere,
      });
    }
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.transform.removeFromParent();
    this.pass.dispose();
    this.mesh.geometry.dispose();
    this.horizonParams.destroy();
    this.atmosphereFallback?.destroy();
    this.instances?.destroy();
    for (const layer of this.layers) layer.uniform.destroy();
    this.layers = [];
  }
}
