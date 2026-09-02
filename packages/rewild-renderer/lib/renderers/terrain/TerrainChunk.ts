import { Box3, Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { LODInfo, TerrainRenderer } from './TerrainRenderer';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Intersection } from '../../core/Raycaster';
import { IComponent, IRaycaster } from '../../../types/interfaces';
import { ChunkSnapshotProvider } from './ChunkSnapshot';
import {
  PaintMask,
  PaintMaskProvider,
  createPaintMask,
  paintMaskSize,
} from './PaintMask';
import { LODMesh } from './LODMesh';
import { DataTexture } from '../../textures/DataTexture';
import { ChunkScatter } from './ChunkScatter';
import { ScatterModels } from './ScatterModels';
import { ScatterInstances } from './Scatter';
import { getScatterGenerationDistance } from './ScatterLayers';
import { TextureProperties } from '../../textures/Texture';

const temp: Vector3 = new Vector3();
// Kept apart from `temp`, which the constructor and the LOD walk also use.
const _groundPoint: Vector3 = new Vector3();

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
  // Built from the first worker response that carried instances. Scatter is
  // chunk state like the splat map — the same instances serve every LOD.
  scatter: ChunkScatter | null = null;
  // heightsVersion the resident scatter was placed against, and whether a
  // request for it is already out. Together they stop every LOD of a new chunk
  // paying for the same placement.
  scatterVersion = -1;
  private scatterRequested = false;
  // Latches once the chunk comes within range of any layer. Separate from the
  // distance itself because a chunk meshes at the LOD threshold it crosses —
  // 200m for LOD 0 — which is further out than anything scatters, so a build
  // gated on the scatter range alone would never carry one.
  private scatterWanted = false;
  // Horizontal distance from the viewer to this chunk's footprint, from the
  // last visibility update. Horizontal because `bounds` is flat at y = 0, so a
  // 3D distance would fold the camera's height in and stop a chunk underneath a
  // high camera ever generating scatter.
  private viewerGroundDistance = Infinity;
  // Last known viewer position, so scatter arriving from the worker is culled
  // on arrival rather than drawing everywhere until the player next moves.
  private viewerPosition = new Vector3();
  // The chunk's splat map — per-texel weights over the climate's material
  // palette, derived from the climate model and `heights`. This is chunk state,
  // not per-LOD state: the worker builds it at full resolution and never varies
  // it by lod, so every LOD of a chunk wants the same texels. Owned here (all
  // LODs merely bind it) and destroyed with the chunk.
  //
  // Two textures because the palette holds eight materials and an RGBA8 texel
  // holds four weights: `splatTexture` carries palette channels 0-3 and
  // `splatTextureExt` channels 4-7. They are always written and destroyed
  // together — the pair is one logical map, split only by texel format.
  //
  // Deliberately NOT registered with the textureManager — its name-keyed map
  // would have every chunk clobber the same entry while the GPU textures leak.
  splatTexture: DataTexture | null = null;
  splatTextureExt: DataTexture | null = null;
  // The full two-plane splat buffer backing the textures above. Retained (not
  // just handed to the textures) so a paint stroke can rewrite the disc under
  // the brush in place and upload only that window — regenerating all 241²
  // texels per stamp is what would make painting stutter.
  splatData: Uint8Array | null = null;
  // The heightsVersion the splat's contents were built from.
  private splatVersion = -1;
  // The chunk's painted biome mask, or null when nothing has been painted here.
  // Feeds splat generation only — paint says what the ground is made of, sculpt
  // says what shape it is (see generateSplatMap).
  biomeMask: PaintMask | null = null;
  // Bumped on every mask edit. Unlike heightsVersion this does NOT make the
  // meshes stale — painting changes no geometry — so it drives splat
  // regeneration alone, and lets an in-flight worker build notice that its
  // splat is already out of date by the time it lands.
  maskVersion = 0;
  // Cached snapshot lookup — one OPFS read per chunk, shared by all LODs.
  private snapshotLookup: Promise<Float32Array | null> | null = null;
  // Cached mask lookup, same one-read-per-chunk contract as the snapshot.
  private maskLookup: Promise<PaintMask | null> | null = null;
  // True once the saved-mask lookup has settled (found one, found none, or
  // failed). Gates creating a blank mask for editing — see editableBiomeMask.
  private maskResolved = false;

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

  /**
   * Resolves this chunk's saved biome mask, or null when it has never been
   * painted. Same one-lookup-per-chunk contract as resolveHeights: the read
   * runs once and every caller shares it. A mask written against a different
   * resolution or a different biome count (the climate changed under it) is
   * discarded rather than misapplied — the chunk then renders as pure climate,
   * which is the same thing an unpainted chunk does.
   */
  resolveBiomeMask(
    provider: PaintMaskProvider | null,
    biomeCount: number
  ): Promise<PaintMask | null> {
    if (this.biomeMask) return Promise.resolve(this.biomeMask);
    if (!provider) {
      this.maskResolved = true;
      return Promise.resolve(null);
    }
    if (!this.maskLookup) {
      this.maskLookup = provider(this.coord.x, this.coord.y).then(
        (mask) => {
          this.maskResolved = true;
          if (!mask) return null;
          const expectedSize = paintMaskSize(this.chunkSize, mask.step);
          if (mask.size !== expectedSize || mask.channels !== biomeCount) {
            console.warn(
              `Chunk ${this.id} biome mask is ${mask.size}² × ${mask.channels}; expected ${expectedSize}² × ${biomeCount} — ignoring it.`
            );
            return null;
          }
          this.biomeMask = mask;
          return mask;
        },
        (err) => {
          this.maskResolved = true;
          console.warn(`Chunk ${this.id} biome mask read failed:`, err);
          return null;
        }
      );
    }
    return this.maskLookup;
  }

  /**
   * The mask a brush should edit, creating an empty one when this chunk has
   * never been painted. Returns null while the saved-mask lookup is still in
   * flight — creating one then would clobber saved paint the moment the read
   * landed, so the brush skips the chunk for that stamp instead (the same
   * "skip until resolved" rule sculpting uses for heights).
   *
   * Does NOT bump maskVersion: a blank mask changes nothing about how the
   * chunk renders, and the stamp that follows bumps it.
   */
  editableBiomeMask(biomeCount: number, step: number): PaintMask | null {
    if (this.biomeMask) return this.biomeMask;
    if (!this.maskResolved) return null;
    this.biomeMask = createPaintMask(this.chunkSize, biomeCount, step);
    return this.biomeMask;
  }

  // Adopts a mask (a fresh one created for a stroke, or a loaded one) and marks
  // the splat stale. The mask lookup is short-circuited so a slow read can no
  // longer replace what the author has since painted.
  setBiomeMask(mask: PaintMask) {
    this.biomeMask = mask;
    this.maskLookup = Promise.resolve(mask);
    this.maskVersion++;
  }

  // Marks the splat stale after the mask was mutated in place (a paint stamp
  // edits the chunk's mask directly to avoid per-stamp copies).
  bumpMaskVersion() {
    this.maskVersion++;
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
    // Retained whole so a paint stroke can rewrite a window of it in place.
    this.splatData = data;

    // `data` holds the two RGBA8 planes back to back (see generateSplatMap).
    // Subarrays view them in place rather than copying: a typed array carries
    // its byteOffset, so writeTexture and DataTexture both upload from the
    // right half of the same buffer.
    const planeStride = this.chunkSize * this.chunkSize * 4;
    const plane0 = data.subarray(0, planeStride);
    const plane1 = data.subarray(planeStride, planeStride * 2);

    if (!this.splatTexture) {
      // No mipmaps: the splat is sampled with the mesh UV, so a chunk covers
      // it at roughly one texel per world unit at every LOD.
      this.splatTexture = new DataTexture(
        new TextureProperties(`terrain_splat_${this.id}`, false),
        plane0,
        this.chunkSize,
        this.chunkSize
      );
      this.splatTextureExt = new DataTexture(
        new TextureProperties(`terrain_splat_ext_${this.id}`, false),
        plane1,
        this.chunkSize,
        this.chunkSize
      );
      // load() is declared async but assigns gpuTexture synchronously, so the
      // textures are bindable as soon as this returns (as callers rely on).
      this.splatTexture.load(renderer);
      this.splatTextureExt.load(renderer);
      return;
    }

    this.splatTexture.data = plane0;
    this.splatTextureExt!.data = plane1;
    renderer.device.queue.writeTexture(
      { texture: this.splatTexture.gpuTexture },
      plane0 as BufferSource,
      { bytesPerRow: this.chunkSize * 4 },
      { width: this.chunkSize, height: this.chunkSize }
    );
    renderer.device.queue.writeTexture(
      { texture: this.splatTextureExt!.gpuTexture },
      plane1 as BufferSource,
      { bytesPerRow: this.chunkSize * 4 },
      { width: this.chunkSize, height: this.chunkSize }
    );
  }

  /**
   * Re-uploads a rectangle of the already-resident splat map, both planes, from
   * `splatData` — which the caller has just rewritten in place.
   *
   * This is the live paint path. A brush stamp dirties only the disc under it,
   * so uploading the whole 241² map (twice, one per plane) per stamp would move
   * ~460 KB a frame to show a change covering a few hundred texels. The rect is
   * given in texels and clamped here; `x1`/`y1` are inclusive.
   *
   * No version bookkeeping: the caller has already updated the buffer this
   * texture is a view of, so there is no staler-data race to lose.
   */
  uploadSplatRegion(
    renderer: Renderer,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) {
    const data = this.splatData;
    if (!data || !this.splatTexture || !this.splatTextureExt) return;

    const size = this.chunkSize;
    const cx0 = Math.max(0, Math.min(size - 1, Math.floor(x0)));
    const cy0 = Math.max(0, Math.min(size - 1, Math.floor(y0)));
    const cx1 = Math.max(0, Math.min(size - 1, Math.ceil(x1)));
    const cy1 = Math.max(0, Math.min(size - 1, Math.ceil(y1)));
    if (cx1 < cx0 || cy1 < cy0) return;

    const width = cx1 - cx0 + 1;
    const height = cy1 - cy0 + 1;
    const bytesPerRow = size * 4;
    const planeStride = size * size * 4;
    // Offset of the window's first texel within its plane. writeTexture reads
    // `height` rows of `width` texels, striding a full row each time, so the
    // source stays the untouched full-width buffer.
    const offset = (cy0 * size + cx0) * 4;

    renderer.device.queue.writeTexture(
      { texture: this.splatTexture.gpuTexture, origin: { x: cx0, y: cy0 } },
      data as BufferSource,
      { offset, bytesPerRow },
      { width, height }
    );
    renderer.device.queue.writeTexture(
      { texture: this.splatTextureExt.gpuTexture, origin: { x: cx0, y: cy0 } },
      data as BufferSource,
      { offset: planeStride + offset, bytesPerRow },
      { width, height }
    );
  }

  // Rebuilds every built LOD mesh from the current in-memory heights, in the
  // background — each mesh keeps rendering until its replacement swaps in.
  // True while this chunk still needs instances placed against `version`. The
  // flag is what keeps four concurrent LOD builds from each generating them.
  // Chunks stream to the terrain's view distance, many times further than
  // anything scatters, so instances are only generated once a chunk is close
  // enough for some layer to draw them.
  needsScatter(version: number): boolean {
    if (!this.scatterWanted) return false;
    if (this.scatterRequested || this.scatterVersion === version) return false;
    this.scatterRequested = true;
    return true;
  }

  // The build that asked for scatter bailed (the chunk was evicted, or its LOD
  // moved on). Without this the request would stay latched and the chunk would
  // never try again.
  cancelScatterRequest(): void {
    this.scatterRequested = false;
  }

  populateScatter(
    renderer: Renderer,
    models: ScatterModels,
    instances: ScatterInstances[],
    version: number
  ) {
    this.scatterRequested = false;
    if (this.disposed) return;

    this.scatter ??= new ChunkScatter(this.transform);
    this.scatter.build(renderer, models, instances);
    this.scatter.updateVisibility(this.viewerPosition);
    this.scatterVersion = version;
  }

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
    this.splatTextureExt?.gpuTexture.destroy();
    this.splatTexture = null;
    this.splatTextureExt = null;
    this.splatData = null;
    this.splatVersion = -1;
    this.scatter?.dispose();
    this.scatter = null;
    this.scatterVersion = -1;
  }

  updateTerrainChunk(
    viewerPos: Vector3,
    terrainRenderer: TerrainRenderer,
    renderer: Renderer
  ) {
    const viewerDistFromNearestEdge = this.bounds.distanceToPoint(viewerPos);
    const isVisible = viewerDistFromNearestEdge <= terrainRenderer.maxViewDst;
    this.visible = isVisible;
    _groundPoint.set(viewerPos.x, 0, viewerPos.z);
    this.viewerGroundDistance = this.bounds.distanceToPoint(_groundPoint);
    this.viewerPosition.copy(viewerPos);
    this.scatter?.updateVisibility(viewerPos);

    // A chunk that meshed before it came into range has no build left to carry
    // scatter, so it needs one asking for. Latching means that happens once.
    const inScatterRange =
      this.viewerGroundDistance <= getScatterGenerationDistance();
    const justEnteredRange = inScatterRange && !this.scatterWanted;
    if (inScatterRange) this.scatterWanted = true;

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
      } else if (justEnteredRange && this.scatterVersion === -1) {
        lodMesh.refresh(renderer);
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
