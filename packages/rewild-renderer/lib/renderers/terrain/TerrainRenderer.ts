import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { TerrainChunk, TerrainChunkEvent } from './TerrainChunk';
import { LODMesh } from './LODMesh';
import { TerrainWorkerPool } from './TerrainWorkerPool';
import { DEFAULT_CLIMATE_PRESET } from './Biomes';
import { ChunkSnapshotProvider } from './ChunkSnapshot';

export class LODInfo {
  lod: i32;
  visibleDstThreshold: f32;
}

export type TerrainEvent =
  | { type: 'chunk-loaded'; chunk: TerrainChunk; lod: LODMesh }
  | { type: 'chunk-unloaded'; chunk: TerrainChunk }
  | { type: 'chunk-disposed'; chunk: TerrainChunk };

const viewerMoveThresholdForChunkUpdate = 25;
const sqrViewerMoveThresholdForChunkUpdate =
  viewerMoveThresholdForChunkUpdate * viewerMoveThresholdForChunkUpdate;

export class TerrainRenderer {
  viewPosOld: Vector3;
  viewerPosition: Vector3;
  chunkSize: i32;
  chunksVisibleInViewDst: i32;
  terrainChunks: Map<string, TerrainChunk>;
  terrainChunksVisibleLastUpdate: TerrainChunk[];
  detailLevels: LODInfo[] = [
    { lod: 0, visibleDstThreshold: 200 },
    { lod: 1, visibleDstThreshold: 400 },
    { lod: 2, visibleDstThreshold: 600 },
    { lod: 3, visibleDstThreshold: 800 },
    { lod: 4, visibleDstThreshold: 1000 },
  ];
  dispatcher: Dispatcher<TerrainEvent>;
  workerPool: TerrainWorkerPool;
  private onChunkLoadedDelegate: (event: TerrainChunkEvent) => void;
  private _needsVisibilityUpdate: boolean = false;
  // Captured in init(); background mesh refreshes (edits) need it outside the
  // update() call path.
  private renderer: Renderer | null = null;

  _hasInitiallyUpdatedTerrain: boolean = false;
  readonly mapChunkSizeLod = 241;
  private _levelOfDetail: number = 0; // Must be any int from 0 to 6

  private _seed: number = 100;
  private _climatePreset: string = DEFAULT_CLIMATE_PRESET;
  // Injected by the host app (game/editor); looks up a chunk's saved snapshot
  // heights on the asset path. Saved ⇒ meshed from storage, absent ⇒ generated.
  snapshotProvider: ChunkSnapshotProvider | null = null;
  private _enabled: boolean = true;

  constructor() {
    this.terrainChunks = new Map();
    this.viewerPosition = new Vector3();
    this.terrainChunksVisibleLastUpdate = [];
    this.dispatcher = new Dispatcher<TerrainEvent>();
    this.onChunkLoadedDelegate = this.onChunkLoaded.bind(this);
  }

  get seed() {
    return this._seed;
  }

  // Chunks capture the seed when they are created, so changing it must throw
  // away every existing chunk — otherwise chunks generated before a world's
  // seed is applied (e.g. during project load) keep default-seed terrain and
  // render disconnected from their later-generated neighbours.
  set seed(value: number) {
    if (this._seed === value) return;
    this._seed = value;
    this.clearChunks();
  }

  get climatePreset() {
    return this._climatePreset;
  }

  // Same capture semantics as `seed` — a preset change invalidates all chunks.
  set climatePreset(value: string) {
    if (this._climatePreset === value) return;
    this._climatePreset = value;
    this.clearChunks();
  }

  get enabled() {
    return this._enabled;
  }

  // Runtime terrain gate (driven by ILevel.hasTerrain in the game; the editor
  // leaves it on). Disabling tears down any chunks already generated.
  set enabled(value: boolean) {
    if (this._enabled === value) return;
    this._enabled = value;
    if (!value) this.clearChunks();
  }

  get maxViewDst() {
    return this.detailLevels.at(-1)!.visibleDstThreshold;
  }

  get evictDistance() {
    return this.maxViewDst * 2;
  }

  init(renderer: Renderer) {
    this.renderer = renderer;
    const mapChunkSize = this.mapChunkSizeLod;
    this.chunkSize = mapChunkSize - 1;
    // Chunks are culled by nearest-edge distance, so the creation square must
    // cover every chunk whose edge can fall within maxViewDst: a chunk at grid
    // offset k is at least (k-1)*chunkSize away from any viewer position
    // inside the current chunk.
    this.chunksVisibleInViewDst =
      Math.floor(this.maxViewDst / this.chunkSize) + 1;
    this.workerPool = new TerrainWorkerPool();
  }

  private onChunkLoaded(event: TerrainChunkEvent) {
    this._needsVisibilityUpdate = true;
    // Note: a re-mesh (edit) raises chunk-loaded again for that LOD without a
    // preceding chunk-unloaded — the chunk never went away. Listeners holding
    // per-chunk resources built from a mesh must release the old one when they
    // (re)build on chunk-loaded, keyed by chunk id. Dispatching chunk-unloaded
    // here instead would be wrong and was actively harmful: a replaced LOD-3
    // mesh would tear down the LOD-0 physics collider, and the chunk-loaded
    // that followed carried lod 3, so the collider was never rebuilt — solid
    // looking terrain the player fell straight through.
    this.dispatcher.dispatch({
      type: 'chunk-loaded',
      chunk: event.chunk,
      lod: event.mesh,
    });
  }

  get levelOfDetail() {
    return this._levelOfDetail;
  }

  set levelOfDetail(value: number) {
    this._levelOfDetail = value;

    if (this._levelOfDetail > 6) {
      this._levelOfDetail = 6;
    } else if (this._levelOfDetail < 0) {
      this._levelOfDetail = 0;
    }

    // Ensure its an integer
    this._levelOfDetail = Math.floor(this._levelOfDetail);
  }

  private updateVisibleChunks(renderer: Renderer) {
    for (const chunk of this.terrainChunksVisibleLastUpdate) {
      chunk.visible = false;
    }

    // Clear the last update array
    this.terrainChunksVisibleLastUpdate.length = 0;

    const currentChunkCoordX = Math.round(
      this.viewerPosition.x / this.chunkSize
    );
    const currentChunkCoordY = Math.round(
      this.viewerPosition.z / this.chunkSize
    );

    const chunksVisibleInViewDst = this.chunksVisibleInViewDst;

    for (
      let yOffset = -chunksVisibleInViewDst;
      yOffset <= chunksVisibleInViewDst;
      yOffset++
    ) {
      for (
        let xOffset = -chunksVisibleInViewDst;
        xOffset <= chunksVisibleInViewDst;
        xOffset++
      ) {
        const viewedChunkCoord = new Vector2(
          currentChunkCoordX + xOffset,
          currentChunkCoordY + yOffset
        );

        const mapId = `${viewedChunkCoord.x},${viewedChunkCoord.y}`;

        if (this.terrainChunks.has(mapId)) {
          const chunk = this.terrainChunks.get(mapId)!;
          chunk.updateTerrainChunk(this.viewerPosition, this, renderer);

          if (chunk.visible) {
            this.terrainChunksVisibleLastUpdate.push(chunk);
          }
        } else {
          const newChunk = new TerrainChunk(
            viewedChunkCoord,
            this.chunkSize,
            this.mapChunkSizeLod,
            this.detailLevels,
            this.seed,
            this.climatePreset
          );

          newChunk.dispatcher.add(this.onChunkLoadedDelegate);
          newChunk.visible = false;
          renderer.scene.addChild(newChunk.transform);
          this.terrainChunks.set(mapId, newChunk);
          newChunk.updateTerrainChunk(this.viewerPosition, this, renderer);
        }
      }
    }

    // Eviction pass — runs after visible chunk processing so we never
    // evict something that was just visited above.
    const evictDistance = this.evictDistance;
    const maxViewDst = this.maxViewDst;
    const viewerPos = this.viewerPosition;
    const toFullEvict: string[] = [];

    for (const [key, chunk] of this.terrainChunks) {
      // Same nearest-edge metric as chunk visibility/LOD selection — using
      // center distance here would unload chunks that are still visible.
      const dist = chunk.bounds.distanceToPoint(viewerPos);
      if (dist > evictDistance) {
        toFullEvict.push(key);
      } else if (dist > maxViewDst) {
        const hadGPU = chunk.lodMesh.some((lod) => lod.gpuState === 'ready');
        chunk.unloadGPU();
        if (hadGPU) {
          this.dispatcher.dispatch({ type: 'chunk-unloaded', chunk });
        }
      }
    }

    for (const key of toFullEvict) {
      const chunk = this.terrainChunks.get(key)!;
      this.dispatcher.dispatch({ type: 'chunk-disposed', chunk });
      chunk.dispatcher.remove(this.onChunkLoadedDelegate);
      chunk.dispose();
      renderer.scene.removeChild(chunk.transform);
      this.terrainChunks.delete(key);
    }
  }

  // Terrain height at world (x, z), bilinearly sampled from the owning
  // chunk's in-memory LOD-0 heightfield; null when that chunk has no heights
  // yet. Exact regardless of terrain altitude (unlike a bounded raycast) and
  // reflects in-flight sculpt edits immediately — the mesh lags a rebuild
  // behind. Used by the editor's orbit-camera ground clamp.
  sampleHeight(x: number, z: number): number | null {
    const span = this.chunkSize;
    const size = this.mapChunkSizeLod;
    if (!span) return null;

    const cx = Math.round(x / span);
    const cy = Math.round(z / span);
    const heights = this.terrainChunks.get(`${cx},${cy}`)?.heights;
    if (!heights) return null;

    // Chunk-local sample coordinates (see MeshGenerator: +z is -sy).
    const fx = Math.min(span, Math.max(0, x - cx * span + span / 2));
    const fz = Math.min(span, Math.max(0, cy * span + span / 2 - z));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, span);
    const z1 = Math.min(z0 + 1, span);
    const tx = fx - x0;
    const tz = fz - z0;

    const h00 = heights[z0 * size + x0];
    const h10 = heights[z0 * size + x1];
    const h01 = heights[z1 * size + x0];
    const h11 = heights[z1 * size + x1];
    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * tz;
  }

  // Applies an edit: replaces a chunk's in-memory heightfield and rebuilds its
  // meshes, without touching the rest of the terrain. Returns false if the
  // chunk isn't loaded (a saved snapshot will supply the heights when it is).
  applyChunkHeights(cx: number, cy: number, heights: Float32Array): boolean {
    const chunk = this.terrainChunks.get(`${cx},${cy}`);
    if (!chunk) return false;

    chunk.setHeights(heights);
    if (this.renderer) chunk.refreshMeshes(this.renderer);
    return true;
  }

  // Rebuilds one chunk's meshes from its current in-memory heights after they
  // were mutated in place (a sculpt stamp), without touching the rest of the
  // terrain. Rebuilds run in the background and swap in when ready — the old
  // mesh keeps rendering meanwhile, and listeners get chunk-unloaded /
  // chunk-loaded around each swap (e.g. to rebuild physics colliders).
  // Repeated calls while a rebuild is in flight coalesce. Returns false if
  // the chunk isn't loaded.
  remeshChunk(cx: number, cy: number): boolean {
    const chunk = this.terrainChunks.get(`${cx},${cy}`);
    if (!chunk || !this.renderer) return false;

    chunk.bumpHeightsVersion();
    chunk.refreshMeshes(this.renderer);
    return true;
  }

  update(renderer: Renderer, camera: Camera) {
    if (!this._enabled) return;

    this.viewerPosition.set(
      camera.transform.position.x,
      0,
      camera.transform.position.z
    );

    if (!this.viewPosOld) {
      this.viewPosOld = new Vector3();
      this.viewPosOld.copy(this.viewerPosition);
    }

    if (!this._hasInitiallyUpdatedTerrain) {
      this.updateVisibleChunks(renderer);

      if (this.terrainChunksVisibleLastUpdate.length > 0)
        this._hasInitiallyUpdatedTerrain = true;
    } else if (
      this.viewPosOld.distanceToSquared(this.viewerPosition) >
      sqrViewerMoveThresholdForChunkUpdate
    ) {
      this.viewPosOld.copy(this.viewerPosition);
      this._needsVisibilityUpdate = false;
      this.updateVisibleChunks(renderer);
    } else if (this._needsVisibilityUpdate) {
      this._needsVisibilityUpdate = false;
      this.updateVisibleChunks(renderer);
    }
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {}

  reset(seed: number, renderer: Renderer) {
    this.dispose();
    this.init(renderer);
    this.seed = seed;
  }

  private clearChunks() {
    const dispatcher = this.dispatcher;
    for (const chunk of this.terrainChunks.values()) {
      dispatcher.dispatch({ type: 'chunk-disposed', chunk });
      chunk.dispatcher.remove(this.onChunkLoadedDelegate);
      chunk.dispose();
      chunk.transform.removeFromParent();
    }
    this.terrainChunks.clear();
    this.terrainChunksVisibleLastUpdate.length = 0;
    this._hasInitiallyUpdatedTerrain = false;
    this._needsVisibilityUpdate = false;
  }

  dispose() {
    this.clearChunks();
    this.workerPool.dispose();
  }
}
