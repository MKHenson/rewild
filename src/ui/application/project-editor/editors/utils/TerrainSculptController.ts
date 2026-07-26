import { Color, Vector2, Vector3 } from 'rewild-common';
import { Renderer, Transform, resolveClimatePreset } from 'rewild-renderer';
import { BrushCursor, pickTerrain } from './BrushCursor';
import {
  applySculptStamp,
  SculptHeightSource,
  SculptBrushType,
} from 'rewild-renderer/lib/renderers/terrain/Sculpt';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';
import { generateBiomeBlendedHeightMap } from 'rewild-renderer/lib/renderers/terrain/Noise';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';
import { writeChunkSnapshot } from 'src/database/chunk-snapshots';
import { projectStore } from 'src/ui/stores/ProjectStore';
import { sculptStore } from 'src/ui/stores/SculptStore';

// Stamp pacing. Amounts are time-scaled so sculpting feels the same at any
// pointer-event rate; dt is clamped so a stall doesn't produce a giant stamp.
const MAX_STAMP_DT = 0.1; // seconds
const RAISE_RATE = 40; // meters/second at strength 1, brush centre
const BLEND_RATE = 6; // blend fraction/second at strength 1 (smooth/flatten)
// Smooth kernel half-width as a fraction of the brush radius (in samples),
// capped so a large brush doesn't blow up the per-sample box average.
const SMOOTH_KERNEL_FRACTION = 0.2;
const SMOOTH_KERNEL_MAX = 8;

interface StrokeState {
  // Chunks touched so far, with the heights array each snapshot will save.
  touched: Map<string, { cx: number; cy: number; heights: Float32Array }>;
  // Height under the initial click — the flatten brush's target.
  flattenTarget: number;
  invert: boolean;
  lastStampTime: number;
}

/**
 * Editor terrain sculpting. Owns the stroke lifecycle:
 * pointer-down begins a stroke, each pointer-move applies a time-scaled brush
 * stamp at the terrain hit point (editing every overlapped chunk in world
 * space via applySculptStamp), and pointer-up saves each touched chunk's full
 * heightfield as a snapshot on the asset path — the issue-05 write path — and
 * marks the project dirty so save/publish syncs the blobs.
 */
export class TerrainSculptController {
  private stroke: StrokeState | null = null;
  // Chunks whose snapshot lookup we've kicked off so their heights become
  // sculptable; getHeights skips them until the lookup lands.
  private pendingResolves = new Set<string>();
  private scratchIntersections: Intersection[] = [];
  private scratchTransforms: Transform[] = [];
  private cursor: BrushCursor;
  private source: SculptHeightSource;

  constructor(private renderer: Renderer) {
    const controller = this;
    this.cursor = new BrushCursor(
      renderer,
      new Color(1, 0.6, 0.1),
      'SculptBrushCursor'
    );
    this.source = {
      get chunkSize() {
        return controller.renderer.terrainRenderer.mapChunkSizeLod;
      },
      get metersPerSample() {
        return controller.renderer.terrainRenderer.metersPerSample;
      },
      getHeights: (cx: number, cy: number) => this.getChunkHeights(cx, cy),
    };
  }

  get isSculpting() {
    return this.stroke !== null;
  }

  /**
   * Shows the brush cursor ring on the terrain at the given world point
   * (scaled to the current brush radius), or hides it when point is null.
   */
  updateCursor(point: Vector3 | null) {
    this.cursor.update(point, sculptStore.radius);
  }

  hideCursor() {
    this.cursor.hide();
  }

  dispose() {
    this.cursor.dispose();
  }

  pickTerrain(raycaster: Raycaster): Intersection | null {
    return pickTerrain(
      this.renderer,
      raycaster,
      this.scratchTransforms,
      this.scratchIntersections
    );
  }

  beginStroke(point: Vector3, invert: boolean) {
    this.stroke = {
      touched: new Map(),
      flattenTarget: point.y,
      invert,
      lastStampTime: performance.now(),
    };
    // First stamp at a nominal frame's worth of time so a click sculpts too.
    this.stamp(point, 1 / 60);
  }

  moveStroke(point: Vector3) {
    const stroke = this.stroke;
    if (!stroke) return;
    const now = performance.now();
    const dt = Math.min((now - stroke.lastStampTime) / 1000, MAX_STAMP_DT);
    stroke.lastStampTime = now;
    if (dt <= 0) return;
    this.stamp(point, dt);
  }

  /**
   * Ends the stroke and persists every touched chunk as a full-heightfield
   * snapshot (overwriting any previous snapshot and re-dirtying its metadata
   * row for the next sync). Untouched chunks store nothing.
   */
  async endStroke(): Promise<void> {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || stroke.touched.size === 0) return;

    const levelId = projectStore.project?.levelId;
    if (!levelId) {
      console.warn(
        'No levelId on the current project — sculpt edits not saved.'
      );
      return;
    }

    const size = this.renderer.terrainRenderer.mapChunkSizeLod;
    await Promise.all(
      [...stroke.touched.values()].map((t) =>
        writeChunkSnapshot(levelId, t.cx, t.cy, t.heights, size)
      )
    );

    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });
  }

  /**
   * Warms up chunks under the brush before/while sculpting: chunks whose
   * heights aren't in memory yet get their snapshot lookup (or generation)
   * kicked off so they are editable by the time the stroke reaches them.
   */
  prefetchHeights(centerX: number, centerZ: number, radius: number) {
    const terrain = this.renderer.terrainRenderer;
    // World span of a chunk (already scaled by metersPerSample), so this maps
    // the world-space brush footprint to chunk coords at any terrain scale.
    const span = terrain.chunkSize;
    const half = span / 2;
    const cxMin = Math.ceil((centerX - radius - half) / span);
    const cxMax = Math.floor((centerX + radius + half) / span);
    const cyMin = Math.ceil((centerZ - radius - half) / span);
    const cyMax = Math.floor((centerZ + radius + half) / span);

    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
        if (chunk && !chunk.heights) this.ensureHeights(chunk);
      }
    }
  }

  private stamp(point: Vector3, dt: number) {
    const stroke = this.stroke;
    if (!stroke) return;

    let type: SculptBrushType = sculptStore.brush;
    if (stroke.invert) {
      if (type === 'raise') type = 'lower';
      else if (type === 'lower') type = 'raise';
    }

    const strength = sculptStore.strength;
    const radius = sculptStore.radius;
    const amount =
      type === 'raise' || type === 'lower'
        ? strength * RAISE_RATE * dt
        : Math.min(1, strength * BLEND_RATE * dt);

    // Smooth over a neighbourhood proportional to the brush so it visibly
    // rounds off features at the size being painted, not just unit-scale
    // roughness. Capped to bound the per-sample averaging cost.
    const smoothKernel = Math.min(
      SMOOTH_KERNEL_MAX,
      Math.max(1, Math.round(radius * SMOOTH_KERNEL_FRACTION))
    );

    const touched = applySculptStamp(this.source, {
      type,
      centerX: point.x,
      centerZ: point.z,
      radius,
      amount,
      target: stroke.flattenTarget,
      smoothKernel,
    });

    const terrain = this.renderer.terrainRenderer;
    for (const t of touched) {
      const key = `${t.cx},${t.cy}`;
      if (!stroke.touched.has(key)) stroke.touched.set(key, t);
      // Heights were mutated in place — rebuild the chunk's meshes in the
      // background (rebuilds coalesce while stamps keep arriving).
      terrain.remeshChunk(t.cx, t.cy);
    }
  }

  // Resolves a chunk's editable heights for the current stamp, or null to
  // skip it this stamp (applySculptStamp then also skips any samples the
  // chunk co-owns, so a not-yet-ready neighbour can never cause a seam).
  private getChunkHeights(cx: number, cy: number): Float32Array | null {
    const chunk = this.renderer.terrainRenderer.terrainChunks.get(
      `${cx},${cy}`
    );
    // Chunk objects exist well beyond raycast range; if one is somehow
    // missing, skipping keeps every write consistent with what will be saved.
    if (!chunk) return null;
    if (chunk.heights) return chunk.heights;
    this.ensureHeights(chunk);
    return null;
  }

  // Resolves heights for a chunk that has none in memory: its saved snapshot
  // if one exists, else its deterministic generated baseline. Runs once per
  // chunk; by the next pointer event the chunk is editable.
  private ensureHeights(chunk: TerrainChunk) {
    if (chunk.heights || this.pendingResolves.has(chunk.id)) return;
    this.pendingResolves.add(chunk.id);

    const terrain = this.renderer.terrainRenderer;
    chunk
      .resolveHeights(terrain.snapshotProvider)
      .then((heights) => {
        if (chunk.disposed) return;
        // Population, not an edit — the meshes already reflect this baseline,
        // so bumping the version here would re-mesh the chunk for nothing.
        chunk.populateHeights(heights ?? this.generateBaseline(chunk));
      })
      .finally(() => {
        this.pendingResolves.delete(chunk.id);
      });
  }

  // The chunk's unedited heightfield — byte-identical to what the terrain
  // worker would generate for it (same generator, seed and preset).
  private generateBaseline(chunk: TerrainChunk): Float32Array {
    const terrain = this.renderer.terrainRenderer;
    const size = terrain.mapChunkSizeLod;
    return generateBiomeBlendedHeightMap(
      size,
      size,
      chunk.seed,
      new Vector2(chunk.coord.x * (size - 1), chunk.coord.y * (size - 1)),
      resolveClimatePreset(chunk.climatePreset)
    );
  }
}
