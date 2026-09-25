import { Box3 } from 'rewild-common';
import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';
import { Transform } from '../../core/Transform';
import { WaterPass } from '../../materials/WaterPass';
import { WaterMap, packWaterSurface } from '../terrain/WaterMap';
import { WaterType } from '../terrain/Water';
import { getWaterGrid, waterGridQuads } from './WaterGrid';

// Interaction layer the water sits on, so scene raycasts (picking, the camera's
// terrain clamp) pass through it. Mirrors InteractionLayer.Water in the app.
export const WATER_INTERACTION_LAYER = 2;

// Room above and below the stored levels for the surface to move into.
const BOUNDS_MARGIN = 4;

class WaterMesh extends Mesh {
  // The grid is flat; the water's real extent comes from the water map.
  localBounds = new Box3();
}

// A chunk's water on the GPU: its surface texture and the mesh that draws the
// shared grid at the chunk's LOD.
export class ChunkWater {
  readonly mesh: WaterMesh;
  private readonly pass: WaterPass;
  private readonly span: number;
  private texture: GPUTexture | null = null;
  private typeTexture: GPUTexture | null = null;
  private packed: Uint16Array | null = null;

  constructor(
    renderer: Renderer,
    parent: Transform,
    water: WaterMap,
    palette: readonly WaterType[],
    span: number,
    lod: number
  ) {
    this.span = span;
    this.pass = new WaterPass();
    this.pass.palette = palette;
    this.mesh = new WaterMesh(
      getWaterGrid(renderer.device, waterGridQuads(lod), span),
      this.pass
    );
    this.mesh.castShadow = false;
    this.mesh.transform.layers.set(WATER_INTERACTION_LAYER);
    parent.addChild(this.mesh.transform);
    this.update(renderer, water);
  }

  /** Uploads a newer water map for the same chunk. */
  update(renderer: Renderer, water: WaterMap) {
    this.packed = packWaterSurface(water, this.packed ?? undefined);

    if (!this.texture || !this.typeTexture || this.texture.width !== water.size) {
      this.texture?.destroy();
      this.typeTexture?.destroy();
      const size = [water.size, water.size];
      const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
      this.texture = renderer.device.createTexture({
        label: 'water-surface',
        size,
        format: 'rgba16float',
        usage,
      });
      this.typeTexture = renderer.device.createTexture({
        label: 'water-types',
        size,
        format: 'rgba8unorm',
        usage,
      });
      this.pass.setTextures(this.texture, this.typeTexture);
    }

    const extent = { width: water.size, height: water.size };
    renderer.device.queue.writeTexture(
      { texture: this.texture },
      this.packed as BufferSource,
      { bytesPerRow: water.size * 8 },
      extent
    );
    renderer.device.queue.writeTexture(
      { texture: this.typeTexture },
      water.typeWeights as BufferSource,
      { bytesPerRow: water.size * 4 },
      extent
    );

    const half = this.span / 2;
    this.mesh.localBounds.min.set(-half, -BOUNDS_MARGIN, -half);
    this.mesh.localBounds.max.set(
      half,
      water.maxLevel - water.baseLevel + BOUNDS_MARGIN,
      half
    );

    const transform = this.mesh.transform;
    transform.position.y = water.baseLevel;
    transform.updateWorldMatrix(true, false);
  }

  /** Draws the grid that suits terrain LOD `lod`. */
  setLod(renderer: Renderer, lod: number) {
    const geometry = getWaterGrid(
      renderer.device,
      waterGridQuads(lod),
      this.span
    );
    if (this.mesh.geometry !== geometry) this.mesh.geometry = geometry;
  }

  dispose() {
    this.mesh.transform.removeFromParent();
    this.pass.dispose();
    this.texture?.destroy();
    this.typeTexture?.destroy();
    this.texture = null;
    this.typeTexture = null;
  }
}
