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
const BOUNDS_MARGIN = 6;

class WaterMesh extends Mesh {
  // The grid is flat; the water's real extent comes from the water map.
  localBounds = new Box3();
}

// A chunk's water map on the GPU: (level, terrain height, coverage, 0) and the
// palette weights. The chunk's water and its terrain both read them.
export class WaterMapTextures {
  surface: GPUTexture | null = null;
  types: GPUTexture | null = null;
  private packed: Uint16Array | null = null;

  /** Uploads `water`, replacing the textures when its size changed. */
  upload(device: GPUDevice, water: WaterMap) {
    this.packed = packWaterSurface(water, this.packed ?? undefined);

    if (!this.surface || !this.types || this.surface.width !== water.size) {
      this.surface?.destroy();
      this.types?.destroy();
      const size = [water.size, water.size];
      const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
      this.surface = device.createTexture({
        label: 'water-surface',
        size,
        format: 'rgba16float',
        usage,
      });
      this.types = device.createTexture({
        label: 'water-types',
        size,
        format: 'rgba8unorm',
        usage,
      });
    }

    const extent = { width: water.size, height: water.size };
    device.queue.writeTexture(
      { texture: this.surface },
      this.packed as BufferSource,
      { bytesPerRow: water.size * 8 },
      extent
    );
    device.queue.writeTexture(
      { texture: this.types },
      water.typeWeights as BufferSource,
      { bytesPerRow: water.size * 4 },
      extent
    );
  }

  dispose() {
    this.surface?.destroy();
    this.types?.destroy();
    this.surface = null;
    this.types = null;
  }
}

// A chunk's water: the mesh that draws the shared grid at the chunk's LOD over
// the chunk's water map textures.
export class ChunkWater {
  readonly mesh: WaterMesh;
  private readonly pass: WaterPass;
  private readonly span: number;
  private quads = 0;

  constructor(
    renderer: Renderer,
    parent: Transform,
    water: WaterMap,
    textures: WaterMapTextures,
    palette: readonly WaterType[],
    span: number,
    lod: number
  ) {
    this.span = span;
    this.pass = new WaterPass();
    this.pass.palette = palette;
    this.pass.wavesBuffer = renderer.terrainRenderer.waterWaves.buffer(
      renderer.device
    );
    this.quads = waterGridQuads(lod);
    this.mesh = new WaterMesh(
      getWaterGrid(renderer.device, this.quads, span),
      this.pass
    );
    this.mesh.castShadow = false;
    this.mesh.transform.layers.set(WATER_INTERACTION_LAYER);
    parent.addChild(this.mesh.transform);
    this.update(water, textures);
  }

  // Waves are summed in world space, and which of them may displace a vertex
  // depends on its world distance from the viewer.
  private placeGrid(baseLevel: number) {
    const parent = this.mesh.transform.parent!.position;
    this.pass.grid = { originX: parent.x, originZ: parent.z, baseLevel };
  }

  /** Takes a newer water map for the same chunk, already in `textures`. */
  update(water: WaterMap, textures: WaterMapTextures) {
    this.pass.setTextures(textures.surface!, textures.types!);

    const half = this.span / 2;
    this.mesh.localBounds.min.set(-half, -BOUNDS_MARGIN, -half);
    this.mesh.localBounds.max.set(
      half,
      water.maxLevel - water.baseLevel + BOUNDS_MARGIN,
      half
    );

    this.placeGrid(water.baseLevel);
    const transform = this.mesh.transform;
    transform.position.y = water.baseLevel;
    transform.updateWorldMatrix(true, false);
  }

  /** Draws the grid that suits terrain LOD `lod`. */
  setLod(renderer: Renderer, lod: number) {
    const quads = waterGridQuads(lod);
    if (quads === this.quads) return;
    this.quads = quads;
    this.mesh.geometry = getWaterGrid(renderer.device, quads, this.span);
  }

  dispose() {
    this.mesh.transform.removeFromParent();
    this.pass.dispose();
  }
}
