import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { Dispatcher, Vector2, Vector3 } from 'rewild-common';
import { LODMesh, TerrainChunk, TerrainChunkEvent } from './TerrainChunk';
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
