import { Box3, Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { LODInfo, TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Intersection } from '../../core/Raycaster';
import { IComponent, IRaycaster } from '../../../types/interfaces';
import { ChunkSnapshotProvider } from './ChunkSnapshot';
import { LODMesh } from './LODMesh';

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
  seed: number;
  climatePreset: string;
  // The chunk's current LOD-0 heightfield — the in-memory truth all LOD meshes
  // are built from, including any edits. Populated from the first worker
  // response (or a snapshot read) and kept for the chunk's lifetime; it is the
  // capture source for snapshot writes (#174) and sculpting (#175).
  heights: Float32Array | null = null;
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
    this.seed = seed;
    this.climatePreset = climatePreset;
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

  // Resolves the heights this chunk's meshes should be built from: in-memory
  // heights when the chunk has them, else its saved snapshot, else null — the
  // caller then falls back to generation. The snapshot lookup runs once and is
  // shared by all LODs.
  resolveHeights(
    provider: ChunkSnapshotProvider | null
  ): Promise<Float32Array | null> {
    if (this.heights) return Promise.resolve(this.heights);
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

  // Replaces the chunk's in-memory heightfield (an edit). Meshes are not
  // touched — call TerrainRenderer.remeshChunk() to rebuild them from it.
  setHeights(heights: Float32Array) {
    const expected = this.chunkSize * this.chunkSize;
    if (heights.length !== expected)
      throw new Error(
        `Chunk ${this.id} heights must have ${expected} samples, got ${heights.length}.`
      );
    this.heights = heights;
  }

  // Tears down all LOD meshes (keeping heights) so the next visibility update
  // re-requests and re-meshes from the current in-memory heights.
  invalidateMeshes() {
    for (const lod of this.lodMesh) {
      if (lod.mesh) {
        if (lod.gpuState === 'ready') lod.mesh.geometry.dispose();
        lod.mesh.material.dispose();
        lod.mesh.transform.removeFromParent();
      }
    }
    for (let i = 0; i < this.detailLevels.length; i++) {
      this.lodMesh[i] = new LODMesh(
        this.detailLevels[i].lod,
        this,
        this.position,
        this.chunkSize,
        this.seed,
        this.climatePreset
      );
    }
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

