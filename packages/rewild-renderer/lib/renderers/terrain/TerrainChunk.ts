import { Box3, Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { LODInfo, TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Intersection } from '../../core/Raycaster';
import { IComponent, IRaycaster } from '../../../types/interfaces';
import { ChunkSnapshotProvider } from './ChunkSnapshot';
import { LODMesh } from './LODMesh';
import { DataTexture } from '../../textures/DataTexture';
import { TextureProperties } from '../../textures/Texture';

const temp: Vector3 = new Vector3();

export type TerrainChunkEvent = {
  type: 'mesh-loaded';
  mesh: LODMesh;
  chunk: TerrainChunk;
};
export class TerrainChunk implements IComponent {
  coord: Vector2;
  // World-space position of the chunk centre (= coord * worldChunkSize). Drives
  // the mesh transform, bounds and the physics collider translation.
  position: Vector2;
  // Sample-space noise offset (= coord * (chunkSize - 1)), passed to the worker
  // for height/splat generation. Deliberately NOT scaled by the world scale:
  // keeping generation in sample space is what makes chunks byte-identical and
  // seam-free at any TERRAIN_METERS_PER_SAMPLE (see MeshGenerator).
  noiseOffset: Vector2;
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
  // Bumped on every heights change (setHeights or an in-place edit via
  // bumpHeightsVersion). LOD meshes compare against it to know they are stale
  // and to coalesce rebuilds while edits keep arriving.
  heightsVersion = 0;
  // True once the chunk's heights diverge from the deterministic generator —
  // an in-memory edit or a loaded snapshot. It gates the seamless-normal apron:
  // the worker's apron ring is the *noise* baseline, correct only for
  // unedited chunks, so an edited chunk must fall back to one-sided edge normals
  // rather than shade against a ring that no longer matches its surface (which
  // showed as dark seams along sculpted chunk borders). Generated and
  // cached-generated chunks stay false and keep the seamless two-sided apron.
  heightsAreEdited = false;
  disposed = false;
  // The chunk's splat map — per-texel weights over the climate's material
  // palette, derived from the climate model and `heights`. This is chunk state,
  // not per-LOD state: the worker builds it at full resolution and never varies
  // it by lod, so every LOD of a chunk wants the same texels. Owned here (all
  // LODs merely bind it) and destroyed with the chunk.
  //
  // Deliberately NOT registered with the textureManager — its name-keyed map
  // would have every chunk clobber the same entry while the GPU textures leak.
  splatTexture: DataTexture | null = null;
  // The heightsVersion the splat's contents were built from.
  private splatVersion = -1;
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
    // Sample-space offset before `coord` is mutated below into world position.
    this.noiseOffset = new Vector2(
      this.coord.x * (chunkSize - 1),
      this.coord.y * (chunkSize - 1)
    );
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
        this.noiseOffset,
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
          // A snapshot is a saved edit — its edges won't match the noise apron.
          if (heights) this.heightsAreEdited = true;
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

  // Fills in the chunk's heightfield for the first time, from a worker
  // generation or a snapshot read. Deliberately does NOT bump heightsVersion:
  // this is the baseline every LOD is already building against, not an edit.
  // (Bumping it made a sibling LOD whose request was still in flight consider
  // itself stale and re-mesh — which used to tear down the chunk's collider.)
  // No-op once heights exist: the first writer wins, and all writers agree
  // (generation is deterministic, and the snapshot lookup is shared).
  populateHeights(heights: Float32Array) {
    if (this.heights) return;
    this.validateHeights(heights);
    this.heights = heights;
  }

  // Replaces the chunk's in-memory heightfield (an edit) and marks meshes
  // stale. Meshes are not touched — call TerrainRenderer.remeshChunk() /
  // refreshMeshes() to rebuild them from it.
  setHeights(heights: Float32Array) {
    this.validateHeights(heights);
    this.heights = heights;
    this.heightsVersion++;
    this.heightsAreEdited = true;
  }

  private validateHeights(heights: Float32Array) {
    const expected = this.chunkSize * this.chunkSize;
    if (heights.length !== expected)
      throw new Error(
        `Chunk ${this.id} heights must have ${expected} samples, got ${heights.length}.`
      );
  }

  // Marks the heights stale after they were mutated in place (sculpting edits
  // the chunk's array directly to avoid per-stamp copies).
  bumpHeightsVersion() {
    this.heightsVersion++;
    this.heightsAreEdited = true;
  }

  // Adopts a worker-built splat map for the heights at `version`. Creates the
  // GPU texture on first call, then re-uploads in place for later edits: the
  // GPUTexture object stays stable across a sculpt stroke, so LOD bind groups
  // built against it stay valid and no per-stamp texture is allocated.
  //
  // Data older than what the texture already holds is ignored, so a slow LOD
  // build that started before an edit cannot overwrite it with pre-edit texels.
  // Equal versions are also ignored: sibling LODs of a chunk produce identical
  // texels, so the first one there wins and the rest are redundant uploads.
  populateSplat(renderer: Renderer, data: Uint8Array, version: number) {
    if (this.splatTexture && version <= this.splatVersion) return;
    this.splatVersion = version;

    if (!this.splatTexture) {
      this.splatTexture = new DataTexture(
        // No mipmaps: the splat is sampled with the mesh UV, so a chunk covers
        // it at roughly one texel per world unit at every LOD.
        new TextureProperties(`terrain_splat_${this.id}`, false),
        data,
        this.chunkSize,
        this.chunkSize
      );
      // load() is declared async but assigns gpuTexture synchronously, so the
      // texture is bindable as soon as this returns (as callers rely on).
      this.splatTexture.load(renderer);
      return;
    }

    this.splatTexture.data = data;
    renderer.device.queue.writeTexture(
      { texture: this.splatTexture.gpuTexture },
      data as BufferSource,
      { bytesPerRow: this.chunkSize * 4 },
      { width: this.chunkSize, height: this.chunkSize }
    );
  }

  // Rebuilds every built LOD mesh from the current in-memory heights, in the
  // background — each mesh keeps rendering until its replacement swaps in.
  refreshMeshes(renderer: Renderer) {
    for (const lod of this.lodMesh) {
      lod.refresh(renderer);
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
    this.disposed = true;
    for (const lod of this.lodMesh) {
      lod.dispose();
    }
    this.splatTexture?.gpuTexture.destroy();
    this.splatTexture = null;
    this.splatVersion = -1;
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

