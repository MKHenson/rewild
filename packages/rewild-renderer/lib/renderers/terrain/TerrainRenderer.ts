import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import {
  Box3,
  Dispatcher,
  Frustum,
  Matrix4,
  Vector2,
  Vector3,
  WebGPUCoordinateSystem,
} from 'rewild-common';
import { TerrainChunk, TerrainChunkEvent } from './TerrainChunk';
import { LODMesh } from './LODMesh';
import { TerrainWorkerPool } from './TerrainWorkerPool';
import { DEFAULT_CLIMATE_PRESET, resolveClimatePreset } from './Biomes';
import { ChunkSnapshotProvider } from './ChunkSnapshot';
import { PaintMaskProvider } from './PaintMask';
import { generateSplatMap } from './Splat';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { ScatterModels } from './ScatterModels';

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

// Re-run chunk selection when the camera turns enough that frustum membership
// could change, even if the player hasn't moved. Facing is compared by dot
// product of unit view directions, so this is cos(~3°).
const viewDirDotThresholdForChunkUpdate = Math.cos(0.05);

// Vertical half-height of the box a chunk is frustum-tested with. A chunk's
// `bounds` are deliberately flat (y=0) for the horizontal nearest-edge metric,
// but terrain has real relief and the camera tilts, so pad generously in y to
// avoid culling a chunk whose surface is actually in view.
const CULL_BOX_HALF_HEIGHT: f32 = 1000;

// Reusable scratch — chunk selection runs every frame the view changes, so it
// must not allocate (see project note on per-frame allocation).
const _projScreenMatrix = new Matrix4();
const _frustum = new Frustum();
const _cullBox = new Box3();
const _viewDir = new Vector3();

export class TerrainRenderer {
  viewPosOld: Vector3;
  // Camera facing at the last chunk-selection pass — a turn past
  // viewDirDotThresholdForChunkUpdate re-runs selection even without movement,
  // since which chunks are in the frustum depends on facing.
  viewDirOld: Vector3;
  viewerPosition: Vector3;
  chunkSize: i32;
  chunksVisibleInViewDst: i32;
  terrainChunks: Map<string, TerrainChunk>;
  terrainChunksVisibleLastUpdate: TerrainChunk[];
  // Distance-banded LODs, nearest to farthest. `visibleDstThreshold` is the
  // nearest-edge WORLD distance past which the *next* (coarser) LOD takes over;
  // the last entry's threshold is maxViewDst, the terrain's visible radius. This
  // — not the camera far plane and not metersPerSample — is what sets how far
  // the horizon reaches: a chunk past maxViewDst is never generated.
  //
  // lod maps to mesh resolution as inc = lod*2 (MeshGenerator), so inc must
  // divide the sample span chunkSize-1 (240): valid inc are 1,2,4,6,8,10,12,16,
  // 20,24 (lod = inc/2; e.g. lod 7 / inc 14 is invalid — 240/14 isn't integer).
  //
  // maxViewDst is 2800. With chunks (240 * metersPerSample = 480) wide, the
  // worst-case far chunk corner sits ~3480 out, inside the 4000 camera far
  // plane with margin (raising the far plane does NOT affect shadows — they are
  // capped at SHADOW_CASCADE_FAR). Ceiling is ~3200 before corners risk the far
  // plane; beyond that, raise the far plane first. lod 8/10 (inc 16/20) are the
  // cheap far rings that carry the extra distance without many verts.
  detailLevels: LODInfo[] = [
    { lod: 0, visibleDstThreshold: 200 },
    { lod: 1, visibleDstThreshold: 400 },
    { lod: 2, visibleDstThreshold: 600 },
    { lod: 3, visibleDstThreshold: 800 },
    { lod: 4, visibleDstThreshold: 1000 },
    { lod: 5, visibleDstThreshold: 1300 },
    { lod: 6, visibleDstThreshold: 1700 },
    { lod: 8, visibleDstThreshold: 2200 },
    { lod: 10, visibleDstThreshold: 2800 },
  ];
  dispatcher: Dispatcher<TerrainEvent>;
  workerPool: TerrainWorkerPool;
  // Geometry, passes and node transforms per scatter layer, shared by every
  // chunk that grows one.
  scatterModels: ScatterModels;
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
  // Same, for a chunk's saved biome paint mask. Absent ⇒ the chunk surfaces
  // from pure climate.
  biomeMaskProvider: PaintMaskProvider | null = null;
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

  // Chunks are fully disposed once their nearest edge passes this distance.
  // The gap above maxViewDst is deliberate hysteresis: chunks in the band
  // (maxViewDst … evictDistance) keep their CPU heightfield/geometry while the
  // GPU buffers are freed, so backtracking a short way re-shows them without a
  // worker rebuild, and a player jittering across the view boundary doesn't
  // thrash create/dispose. 1.3× leaves ~2 chunks of slack (well above the
  // 25-unit move threshold) while holding far fewer trailing chunks resident
  // than the old 2× — the full-res heightfield + splat each retained chunk
  // carries (~0.45 MB CPU, independent of its LOD) is the terrain's dominant
  // memory cost, so the trailing band is where the savings are.
  get evictDistance() {
    return this.maxViewDst * 1.3;
  }

  // Chunks within this nearest-edge distance always load, ignoring the frustum,
  // so the ground under and around the player exists no matter which way the
  // camera faces. It matches the LOD-0 band exactly — LOD 0 is the only detail
  // level that produces a physics collider (see GameManager's chunk-loaded
  // handler), so every chunk that could carry the player must be in this set.
  get nearForceLoadDistance() {
    return this.detailLevels[0].visibleDstThreshold;
  }

  // World units per heightfield sample step. The heightfield is generated at
  // one sample per unit; this stretches the mesh/placement so a chunk spans
  // (samples-1) * metersPerSample world units with the same poly count. All of
  // this class's world math derives from `chunkSize`, so it flows through for
  // free; the value is surfaced here for the sculpt/editor coordinate mapping.
  get metersPerSample() {
    return TERRAIN_METERS_PER_SAMPLE;
  }

  // Assembles the (mapChunkSizeLod + 2)² apron an edited chunk's mesh is built
  // from: `inner` (the chunk's own heights) in the centre, plus a one-sample
  // ring of the four edge neighbours' current heights so edge-vertex normals are
  // two-sided and match the neighbour — otherwise sculpted borders show a dark
  // normal seam. A neighbour that isn't loaded (no heights) falls back to
  // duplicating this chunk's edge sample, i.e. a one-sided edge there. Corners
  // are left unset: the gradient only reads the 4-neighbourhood, never diagonals.
  //
  // Reads neighbours' live heights, so when a sculpt writes a shared edge both
  // chunks are re-meshed (the stamp's touched set) and each reads the other's
  // edit — seamless. Generated/unedited chunks don't use this; their worker-side
  // noise apron is already correct and needs no loaded neighbours.
  buildApron(inner: Float32Array, coord: Vector2): Float32Array {
    const size = this.mapChunkSizeLod; // samples per side (e.g. 241)
    const a = size + 2; // aproned side
    const apron = new Float32Array(a * a);
    const chunks = this.terrainChunks;
    const cx = coord.x;
    const cy = coord.y;
    const heightsAt = (x: number, y: number): Float32Array | null =>
      chunks.get(`${x},${y}`)?.heights ?? null;

    // Inner region → apron centre.
    for (let sy = 0; sy < size; sy++) {
      apron.set(inner.subarray(sy * size, sy * size + size), (sy + 1) * a + 1);
    }

    // Edge rings. +sx is +X, +sy is −Z, so the neighbour one step past +sy (the
    // top ring, sy = −1) is the chunk at cy + 1; see the mesh vertex placement.
    const left = heightsAt(cx - 1, cy);
    const right = heightsAt(cx + 1, cy);
    const top = heightsAt(cx, cy + 1);
    const bottom = heightsAt(cx, cy - 1);
    for (let sy = 0; sy < size; sy++) {
      const row = (sy + 1) * a;
      // sx = −1 is the left neighbour's second-to-last column (its last column
      // is our first); sx = size is the right neighbour's second column.
      apron[row] = left ? left[sy * size + (size - 2)] : inner[sy * size];
      apron[row + (a - 1)] = right
        ? right[sy * size + 1]
        : inner[sy * size + (size - 1)];
    }
    for (let sx = 0; sx < size; sx++) {
      apron[sx + 1] = top ? top[(size - 2) * size + sx] : inner[sx];
      apron[(a - 1) * a + (sx + 1)] = bottom
        ? bottom[size + sx]
        : inner[(size - 1) * size + sx];
    }

    return apron;
  }

  init(renderer: Renderer) {
    this.renderer = renderer;
    const mapChunkSize = this.mapChunkSizeLod;
    // World span of a chunk: (samples - 1) sample steps, each metersPerSample
    // world units wide. Every world-space calc below (chunk coords, cull box,
    // distances, sampleHeight) keys off this, so scaling is centralised here.
    this.chunkSize = (mapChunkSize - 1) * this.metersPerSample;
    // Chunks are culled by nearest-edge distance, so the creation square must
    // cover every chunk whose edge can fall within maxViewDst: a chunk at grid
    // offset k is at least (k-1)*chunkSize away from any viewer position
    // inside the current chunk.
    this.chunksVisibleInViewDst =
      Math.floor(this.maxViewDst / this.chunkSize) + 1;
    this.workerPool = new TerrainWorkerPool();
    this.scatterModels = new ScatterModels();
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

    const chunkSize = this.chunkSize;
    const half = chunkSize / 2;
    const maxViewDst = this.maxViewDst;
    const nearForceLoadDst = this.nearForceLoadDistance;
    const viewerX = this.viewerPosition.x;
    const viewerZ = this.viewerPosition.z;

    const currentChunkCoordX = Math.round(viewerX / chunkSize);
    const currentChunkCoordY = Math.round(viewerZ / chunkSize);

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
        const coordX = currentChunkCoordX + xOffset;
        const coordY = currentChunkCoordY + yOffset;

        // Chunk world centre and nearest-edge (horizontal) distance to the
        // viewer — the same metric as bounds.distanceToPoint, computed here
        // without needing the chunk to exist yet.
        const centreX = coordX * chunkSize;
        const centreZ = coordY * chunkSize;
        const dx = Math.max(Math.abs(viewerX - centreX) - half, 0);
        const dz = Math.max(Math.abs(viewerZ - centreZ) - half, 0);
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Beyond the view radius it is never a candidate; the eviction pass
        // below reclaims any such chunk that is already loaded.
        if (dist > maxViewDst) continue;

        const mapId = `${coordX},${coordY}`;
        const existing = this.terrainChunks.get(mapId);

        // An already-loaded chunk is always managed exactly as before —
        // distance-based visibility and LOD. The frustum must NOT hide it: the
        // render pass already frustum-culls what is off-screen, and hiding
        // loaded terrain here made it vanish (and re-stream) each time the
        // camera turned away and back. The frustum only decides what to
        // *generate* (the creation branch below), never what stays on screen.
        if (existing) {
          existing.updateTerrainChunk(this.viewerPosition, this, renderer);

          if (existing.visible) {
            this.terrainChunksVisibleLastUpdate.push(existing);
          }
          continue;
        }

        // Not created yet: only spawn (and generate) it when it is worth it —
        // within the near/physics radius (always, regardless of facing) or
        // actually in view. This is the "load what the viewer sees first, never
        // generate terrain the player hasn't looked at" behaviour. Once created
        // it persists and is managed above until distance eviction disposes it.
        let wanted = dist <= nearForceLoadDst;
        if (!wanted) {
          _cullBox.min.set(
            centreX - half,
            -CULL_BOX_HALF_HEIGHT,
            centreZ - half
          );
          _cullBox.max.set(
            centreX + half,
            CULL_BOX_HALF_HEIGHT,
            centreZ + half
          );
          wanted = _frustum.intersectsBox(_cullBox);
        }
        if (!wanted) continue;

        const newChunk = new TerrainChunk(
          new Vector2(coordX, coordY),
          chunkSize,
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

    // Eviction pass — runs after visible chunk processing so we never
    // evict something that was just visited above.
    const evictDistance = this.evictDistance;
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
    const span = this.chunkSize; // world units per chunk
    const size = this.mapChunkSizeLod;
    if (!span) return null;

    const cx = Math.round(x / span);
    const cy = Math.round(z / span);
    const heights = this.terrainChunks.get(`${cx},${cy}`)?.heights;
    if (!heights) return null;

    // Chunk-local *world* offset (see MeshGenerator: +z is -sy), then to sample
    // space by dividing out the world scale — heights are indexed per sample.
    const mps = this.metersPerSample;
    const maxSample = size - 1;
    const fx = Math.min(
      maxSample,
      Math.max(0, (x - cx * span + span / 2) / mps)
    );
    const fz = Math.min(
      maxSample,
      Math.max(0, (cy * span + span / 2 - z) / mps)
    );
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, maxSample);
    const z1 = Math.min(z0 + 1, maxSample);
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

  // The chunk that owns world (x, z) — the same world→chunk mapping
  // sampleHeight uses to pick a heightfield, exposed so a listener can tell
  // which placements a given chunk's heights are responsible for. Null before
  // init(), when chunkSize is still zero.
  chunkIdAt(x: number, z: number): string | null {
    const span = this.chunkSize;
    if (!span) return null;
    return `${Math.round(x / span)},${Math.round(z / span)}`;
  }

  // Surface normal at world (x, z), from a central difference of sampleHeight
  // one sample step either side; false (and out untouched) when the owning
  // chunk has no heights. A probe that lands in an unloaded neighbour falls
  // back to the centre height, so the slope goes one-sided at the seam rather
  // than failing.
  sampleNormal(x: number, z: number, out: Vector3): boolean {
    const h = this.sampleHeight(x, z);
    if (h === null) return false;

    const step = this.metersPerSample;
    const hx0 = this.sampleHeight(x - step, z) ?? h;
    const hx1 = this.sampleHeight(x + step, z) ?? h;
    const hz0 = this.sampleHeight(x, z - step) ?? h;
    const hz1 = this.sampleHeight(x, z + step) ?? h;

    // For a heightfield y = h(x, z) the normal is (-dh/dx, 1, -dh/dz).
    out.set((hx0 - hx1) / (2 * step), 1, (hz0 - hz1) / (2 * step)).normalize();
    return true;
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

  /**
   * Regenerates a chunk's splat map from its current heights and biome mask,
   * and uploads it — the whole map, or just the LOD-0 sample window given.
   *
   * This is the paint brush's counterpart to remeshChunk, and the reason
   * painting is cheap: a stroke changes no geometry, so nothing is re-meshed and
   * no worker is involved. Only the disc under the brush is resolved and only
   * that rectangle is uploaded, so the cost tracks the brush size rather than
   * the chunk size.
   *
   * Returns false when the chunk isn't loaded or has no splat yet (its first
   * worker build will pick the mask up on its own).
   */
  refreshChunkSplat(
    cx: number,
    cy: number,
    window?: { x0: number; y0: number; x1: number; y1: number }
  ): boolean {
    const chunk = this.terrainChunks.get(`${cx},${cy}`);
    const renderer = this.renderer;
    if (!chunk || !renderer) return false;
    // Nothing resident to patch — the pending/next build generates from the
    // mask anyway, so there is nothing to do and nothing lost.
    if (!chunk.splatData || !chunk.heights || !chunk.splatTexture) return false;

    const size = this.mapChunkSizeLod;
    generateSplatMap(
      size,
      size,
      chunk.seed,
      chunk.noiseOffset,
      resolveClimatePreset(chunk.climatePreset),
      chunk.heights,
      {
        biomeMask: chunk.biomeMask,
        out: chunk.splatData,
        region: window,
      }
    );

    if (window) {
      chunk.uploadSplatRegion(
        renderer,
        window.x0,
        window.y0,
        window.x1,
        window.y1
      );
    } else {
      chunk.uploadSplatRegion(renderer, 0, 0, size - 1, size - 1);
    }
    return true;
  }

  /**
   * The LOD-0 sample window a world-space disc covers in chunk (cx, cy),
   * padded by one sample so the splat's bilinear filtering has a correct ring
   * around the edited texels. Returns null when the disc misses the chunk.
   *
   * Mirrors sampleHeight's world→sample mapping (+z is −sy), which is the same
   * convention the mesh, the heightfield and the mask all use.
   */
  splatWindowForDisc(
    cx: number,
    cy: number,
    centerX: number,
    centerZ: number,
    radius: number
  ): { x0: number; y0: number; x1: number; y1: number } | null {
    const span = this.chunkSize; // world units per chunk
    const size = this.mapChunkSizeLod;
    const mps = this.metersPerSample;
    const max = size - 1;

    // Chunk-local world offsets of the disc's bounding box, then to samples.
    const localMinX = centerX - radius - cx * span + span / 2;
    const localMaxX = centerX + radius - cx * span + span / 2;
    // +z is −sy, so the far edge in z is the *small* sample row.
    const localMinZ = cy * span + span / 2 - (centerZ + radius);
    const localMaxZ = cy * span + span / 2 - (centerZ - radius);

    const x0 = Math.floor(localMinX / mps) - 1;
    const x1 = Math.ceil(localMaxX / mps) + 1;
    const y0 = Math.floor(localMinZ / mps) - 1;
    const y1 = Math.ceil(localMaxZ / mps) + 1;
    if (x1 < 0 || y1 < 0 || x0 > max || y0 > max) return null;

    return {
      x0: Math.max(0, x0),
      y0: Math.max(0, y0),
      x1: Math.min(max, x1),
      y1: Math.min(max, y1),
    };
  }

  update(renderer: Renderer, camera: Camera) {
    if (!this._enabled) return;

    // getWorldDirection refreshes the camera's world matrix and, via its
    // transform observer, matrixWorldInverse — so both the frustum built below
    // and the facing comparison use this frame's camera pose.
    camera.getWorldDirection(_viewDir);

    this.viewerPosition.set(
      camera.transform.position.x,
      0,
      camera.transform.position.z
    );

    // View frustum for this pass; chunk selection uses it to skip generating
    // terrain the player cannot see. One frame stale at worst, which coarse
    // chunk streaming tolerates.
    _projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    _frustum.setFromProjectionMatrix(_projScreenMatrix, WebGPUCoordinateSystem);

    if (!this.viewPosOld) {
      this.viewPosOld = new Vector3();
      this.viewPosOld.copy(this.viewerPosition);
      this.viewDirOld = new Vector3();
      this.viewDirOld.copy(_viewDir);
    }

    if (!this._hasInitiallyUpdatedTerrain) {
      this.updateVisibleChunks(renderer);

      if (this.terrainChunksVisibleLastUpdate.length > 0)
        this._hasInitiallyUpdatedTerrain = true;
      return;
    }

    const moved =
      this.viewPosOld.distanceToSquared(this.viewerPosition) >
      sqrViewerMoveThresholdForChunkUpdate;
    // Facing changed enough to alter frustum membership (unit vectors, so the
    // dot product is cos of the turn angle).
    const turned =
      this.viewDirOld.dot(_viewDir) < viewDirDotThresholdForChunkUpdate;

    if (moved || turned || this._needsVisibilityUpdate) {
      this.viewPosOld.copy(this.viewerPosition);
      this.viewDirOld.copy(_viewDir);
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
    this.scatterModels.dispose();
    this.workerPool.dispose();
  }
}
