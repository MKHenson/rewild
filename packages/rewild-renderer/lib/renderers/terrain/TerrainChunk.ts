import { Box3, Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { TerrainPass } from '../../materials/TerrainPass';
import { Mesh } from '../../core/Mesh';
import { LODInfo, TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';
import { Geometry } from '../../geometry/Geometry';
import { Intersection } from '../../core/Raycaster';
import { IComponent, IRaycaster } from '../../../types/interfaces';
import { ChunkSnapshotProvider } from './ChunkSnapshot';

const temp: Vector3 = new Vector3();

export type TerrainChunkEvent = {
  type: 'mesh-loaded';
  mesh: LODMesh;
  chunk: TerrainChunk;
};
export class TerrainChunk implements IComponent {
  coord: Vector2;
  position: Vector2;
  _visible: boolean = false;
  bounds: Box3;
  transform: Transform;
  detailLevels: LODInfo[];
  lodMesh: LODMesh[];
  chunkSize: i32;
  dispatcher: Dispatcher<TerrainChunkEvent>;
  id: string;
  // Cached snapshot lookup — one OPFS read per chunk, shared by all LODs.
  private snapshotLookup: Promise<Float32Array | null> | null = null;

  constructor(
    coord: Vector2,
    size: i32,
    chunkSize: i32,
    detailLevels: LODInfo[],
    seed: number,
    climatePreset: string
  ) {
    this.id = `${coord.x},${coord.y}`;
    this.coord = new Vector2(coord.x, coord.y);
    this.position = coord.multiplyScalar(size);
    this.chunkSize = chunkSize;
    this.detailLevels = detailLevels;
    this.dispatcher = new Dispatcher<TerrainChunkEvent>();

    this.lodMesh = new Array<LODMesh>(detailLevels.length);

    this.transform = new Transform();
    this.transform.component = this;
    this.transform.position.set(this.position.x, 0, this.position.y);

    for (let i = 0; i < detailLevels.length; i++) {
      this.lodMesh[i] = new LODMesh(
        detailLevels[i].lod,
        this,
        this.position,
        chunkSize,
        seed,
        climatePreset
      );
    }

    this.bounds = new Box3();
    this.bounds.setFromCenterAndSize(
      this.transform.position,
      temp.set(size, 0, size)
    );
  }

  // Resolves this chunk's saved snapshot heights, or null when the chunk has
  // no snapshot (or the provider fails / the blob is unusable) — the caller
  // then falls back to generation. The lookup runs once and is shared.
  fetchSnapshotHeights(
    provider: ChunkSnapshotProvider | null
  ): Promise<Float32Array | null> {
    if (!provider) return Promise.resolve(null);
    if (!this.snapshotLookup) {
      const expected = this.chunkSize * this.chunkSize;
      this.snapshotLookup = provider(this.coord.x, this.coord.y).then(
        (heights) => {
          if (heights && heights.length !== expected) {
            console.warn(
              `Chunk ${this.id} snapshot has ${heights.length} samples; expected ${expected} — regenerating instead.`
            );
            return null;
          }
          return heights;
        },
        (err) => {
          console.warn(`Chunk ${this.id} snapshot read failed:`, err);
          return null;
        }
      );
    }
    return this.snapshotLookup;
  }

  raycast(raycaster: IRaycaster, intersects: Intersection[]) {
    for (const chunk of this.lodMesh) {
      if (chunk.mesh && chunk.mesh.visible) {
        // const mesh = chunk.mesh;
        // mesh.raycast(raycaster, intersects);
      }
    }
  }

  unloadGPU() {
    for (const lod of this.lodMesh) {
      lod.unloadGPU();
    }
  }

  dispose() {
    for (const lod of this.lodMesh) {
      if (lod.mesh) {
        if (lod.gpuState === 'ready') lod.mesh.geometry.dispose();
        lod.mesh.material.dispose();
      }
    }
  }

  updateTerrainChunk(
    viewerPos: Vector3,
    terrainRenderer: TerrainRenderer,
    renderer: Renderer
  ) {
    const viewerDistFromNearestEdge = this.bounds.distanceToPoint(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.visible = isVisible;

    for (const lod of this.lodMesh) {
      if (lod.mesh) {
        lod.mesh.visible = false;
      }
    }

    if (isVisible) {
      let lodIndex = 0;

      for (let i = 0; i < this.detailLevels.length - 1; i++) {
        const detailLevel = this.detailLevels[i];
        if (viewerDistFromNearestEdge > detailLevel.visibleDstThreshold) {
          lodIndex = i + 1;
        } else {
          break;
        }
      }

      const lodMesh = this.lodMesh[lodIndex];

      if (lodMesh.gpuState === 'none' || lodMesh.gpuState === 'unloaded') {
        lodMesh.requestMesh(renderer);
      }

      if (lodMesh.gpuState === 'ready') {
        lodMesh.mesh.visible = true;
      } else {
        // Target LOD not ready — show nearest available LOD to prevent a pop.
        // Prefer coarser LODs (higher index, loaded first on approach); fall
        // back to finer LODs (lower index, retained from a prior close pass).
        let shown = false;
        for (let i = lodIndex + 1; i < this.lodMesh.length && !shown; i++) {
          if (this.lodMesh[i].gpuState === 'ready') {
            this.lodMesh[i].mesh.visible = true;
            shown = true;
          }
        }
        if (!shown) {
          for (let i = lodIndex - 1; i >= 0 && !shown; i--) {
            if (this.lodMesh[i].gpuState === 'ready') {
              this.lodMesh[i].mesh.visible = true;
              shown = true;
            }
          }
        }
      }
    }
  }

  set visible(visible: boolean) {
    if (visible) {
      this._visible = true;
      this.transform.visible = true;
    } else {
      this._visible = false;
      this.transform.visible = false;
    }
  }

  get visible() {
    return this._visible;
  }
}

export type LODMeshGPUState = 'none' | 'requested' | 'ready' | 'unloaded';

export class LODMesh {
  mesh: Mesh;
  lod: i32;
  position: Vector2;
  gpuState: LODMeshGPUState;
  chunk: TerrainChunk;
  chunkSize: i32;
  heights: Float32Array;
  seed: number;
  climatePreset: string;

  constructor(
    lod: i32,
    chunk: TerrainChunk,
    position: Vector2,
    chunkSize: i32,
    seed: number,
    climatePreset: string
  ) {
    this.lod = lod;
    this.gpuState = 'none';
    this.chunk = chunk;
    this.chunkSize = chunkSize;
    this.position = position;
    this.seed = seed;
    this.climatePreset = climatePreset;
  }

  requestMesh(renderer: Renderer) {
    if (this.gpuState === 'unloaded') {
      this.reuploadGPU(renderer);
      return;
    }
    if (this.gpuState !== 'none') return;
    this.gpuState = 'requested';
    this.load(this.chunkSize, this.lod, renderer);
  }

  unloadGPU() {
    if (this.gpuState !== 'ready') return;
    this.mesh.geometry.dispose();
    this.mesh.transform.visible = false;
    this.gpuState = 'unloaded';
  }

  private async reuploadGPU(renderer: Renderer) {
    this.gpuState = 'requested';
    this.mesh.geometry.build(
      renderer.device,
      renderer.bvhConfig,
      renderer.bvhWorkerManager ?? undefined
    );
    this.mesh.transform.visible = true;
    this.gpuState = 'ready';
    this.chunk.dispatcher.dispatch({
      type: 'mesh-loaded',
      mesh: this,
      chunk: this.chunk,
    });
  }

  async load(chunkSize: i32, lod: i32, renderer: Renderer) {
    const terrainRenderer = renderer.terrainRenderer;

    // Saved ⇒ mesh the stored heights, skipping generation; absent ⇒ the
    // worker generates from the recipe as before.
    const storedHeights = await this.chunk.fetchSnapshotHeights(
      terrainRenderer.snapshotProvider
    );
    const { texture, vertices, uvs, normals, indices } =
      await terrainRenderer.workerPool.enqueue({
        chunkSize,
        lod,
        position: this.position,
        seed: this.seed,
        climatePreset: this.climatePreset,
        heights: storedHeights ?? undefined,
      });

    const terrainTexture = renderer.textureManager.addTexture(
      new DataTexture(
        new TextureProperties('terrain1', false),
        texture,
        chunkSize,
        chunkSize
      )
    );

    const geometry = new Geometry();
    geometry.vertices = vertices;
    geometry.normals = normals; // pre-computed in worker using main-mesh triangles only
    geometry.uvs = uvs;
    geometry.indices = indices;

    this.heights = new Float32Array(vertices.length / 3);
    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
      this.heights[j] = vertices[i + 1];
    }

    terrainTexture.load(renderer);
    geometry.build(
      renderer.device,
      renderer.bvhConfig,
      renderer.bvhWorkerManager ?? undefined
    );

    const terrainPass = new TerrainPass();
    terrainPass.terrainUniforms.sampler =
      renderer.samplerManager.get('linear-clamped');
    terrainPass.terrainUniforms.texture = terrainTexture.gpuTexture;
    terrainPass.terrainUniforms.albedoTexture = renderer.textureManager.get(
      'rocky-mountain-texture-seamless'
    ).gpuTexture;
    terrainPass.terrainUniforms.normalMap = renderer.textureManager.get(
      'rocky-mountain-texture-seamless-normal'
    ).gpuTexture;
    terrainPass.terrainUniforms.shininess = 5;

    this.mesh = new Mesh(geometry, terrainPass);
    this.chunk.transform.addChild(this.mesh.transform);
    // This mesh arrives mid-frame from a worker; until the next render pass
    // its matrixWorld is identity, which would place the chunk's geometry at
    // the world origin. A pointer-event raycast landing in that window (e.g.
    // the orbit controller's terrain clamp) would hit phantom terrain, so
    // compute the world matrix immediately.
    this.mesh.transform.updateWorldMatrix(true, false);
    this.gpuState = 'ready';
    this.chunk.dispatcher.dispatch({
      type: 'mesh-loaded',
      mesh: this,
      chunk: this.chunk,
    });
  }
}
