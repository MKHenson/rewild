import { Color, Vector3 } from 'rewild-common';
import { Renderer, Transform } from 'rewild-renderer';
import {
  applyPaintStamp,
  PaintMask,
  PaintMaskSource,
  SCATTER_MASK_STEP,
} from 'rewild-renderer/lib/renderers/terrain/PaintMask';
import {
  getScatterLayerOrder,
  scatterExcludeChannel,
  scatterMaskChannels,
} from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';
import { writeScatterMask } from 'src/database/scatter-masks';
import { projectStore } from 'src/ui/stores/ProjectStore';
import { scatterPaintStore } from 'src/ui/stores/ScatterPaintStore';
import { BrushCursor, pickTerrain } from './BrushCursor';

// Stamp pacing, mirroring the biome paint controller.
const MAX_STAMP_DT = 0.1; // seconds
const PAINT_RATE = 2.5;

interface StrokeState {
  touched: Map<string, { cx: number; cy: number; mask: PaintMask }>;
  erase: boolean;
  lastStampTime: number;
}

/**
 * Editor scatter-density painting. The third terrain brush: a stroke edits how
 * much of a layer grows at each texel, and the chunks it touches re-place their
 * instances from it.
 *
 * The biome paint controller's twin, with one difference that matters. Painting
 * a biome only recolours a splat map, so a stamp resolves the texels under the
 * brush and uploads that rectangle. Scatter has no such shortcut — placement is
 * a worker pass over the whole chunk and an instance is a thing, not a texel —
 * so a stamp marks the chunk's instances stale and the next visibility update
 * re-places them. The chunk's own in-flight gate is what keeps a fast stroke
 * from queueing a build per stamp: it asks again next frame instead.
 */
export class TerrainScatterPaintController {
  private stroke: StrokeState | null = null;
  private pendingResolves = new Set<string>();
  private scratchIntersections: Intersection[] = [];
  private scratchTransforms: Transform[] = [];
  private cursor: BrushCursor;
  private source: PaintMaskSource;

  constructor(private renderer: Renderer) {
    const controller = this;
    this.cursor = new BrushCursor(
      renderer,
      // Green against the sculpt brush's orange and the biome brush's cyan —
      // three tools share left-drag, so the ring has to say which is armed.
      new Color(0.35, 0.85, 0.4),
      'ScatterPaintBrushCursor'
    );
    this.source = {
      get chunkSize() {
        return controller.renderer.terrainRenderer.mapChunkSizeLod;
      },
      get metersPerSample() {
        return controller.renderer.terrainRenderer.metersPerSample;
      },
      step: SCATTER_MASK_STEP,
      channels: scatterMaskChannels(),
      // A layer slot's density says nothing about its neighbour's: grass under
      // trees is two full channels, not a contradiction.
      independentChannels: true,
      getMask: (cx: number, cy: number) => this.getChunkMask(cx, cy),
    };
  }

  get isPainting() {
    return this.stroke !== null;
  }

  /** Layers a mask can address — the whole library, not a climate's subset. */
  get layerCount(): number {
    return getScatterLayerOrder().length;
  }

  updateCursor(point: Vector3 | null) {
    this.cursor.update(point, scatterPaintStore.radius);
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

  beginStroke(point: Vector3, erase: boolean) {
    this.stroke = {
      touched: new Map(),
      erase,
      lastStampTime: performance.now(),
    };
    // First stamp at a nominal frame's worth of time so a click paints too.
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
   * Ends the stroke and persists every touched chunk's mask (overwriting any
   * previous one and re-dirtying its metadata row for the next sync).
   * Untouched chunks store nothing.
   */
  async endStroke(): Promise<void> {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || stroke.touched.size === 0) return;

    const levelId = projectStore.project?.levelId;
    if (!levelId) {
      console.warn(
        'No levelId on the current project — scatter density not saved.'
      );
      return;
    }

    await Promise.all(
      [...stroke.touched.values()].map((t) =>
        writeScatterMask(levelId, t.cx, t.cy, t.mask)
      )
    );

    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });
  }

  /**
   * Warms up chunks under the brush before/while painting, so they are
   * paintable by the time the stroke reaches them.
   */
  prefetchMasks(centerX: number, centerZ: number, radius: number) {
    const terrain = this.renderer.terrainRenderer;
    const span = terrain.chunkSize;
    const half = span / 2;
    const cxMin = Math.ceil((centerX - radius - half) / span);
    const cxMax = Math.floor((centerX + radius + half) / span);
    const cyMin = Math.ceil((centerZ - radius - half) / span);
    const cyMax = Math.floor((centerZ + radius + half) / span);

    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
        if (chunk && !chunk.scatterMask) this.ensureMask(chunk);
      }
    }
  }

  private stamp(point: Vector3, dt: number) {
    const stroke = this.stroke;
    if (!stroke) return;

    // Shift erases whichever brush is selected, so a held Shift is always the
    // way back to what the biome grows.
    const brush = stroke.erase ? 'erase' : scatterPaintStore.brush;
    const amount = Math.min(1, scatterPaintStore.strength * PAINT_RATE * dt);

    const excludeChannel = scatterExcludeChannel();
    const touched = applyPaintStamp(this.source, {
      // Exclude is an ordinary paint stroke on the exclusion channel.
      type: brush === 'erase' ? 'erase' : 'paint',
      channel: brush === 'exclude' ? excludeChannel : scatterPaintStore.layer,
      // Planting lifts any clearing it lands in, so painting back into a
      // cleared area works with the brush the author already has in hand.
      release: brush === 'paint' ? excludeChannel : undefined,
      centerX: point.x,
      centerZ: point.z,
      radius: scatterPaintStore.radius,
      amount,
    });

    const terrain = this.renderer.terrainRenderer;
    for (const t of touched) {
      const key = `${t.cx},${t.cy}`;
      if (!stroke.touched.has(key)) stroke.touched.set(key, t);
      terrain.refreshChunkScatter(t.cx, t.cy);
    }
  }

  // Resolves a chunk's editable mask for the current stamp, or null to skip it
  // this stamp (applyPaintStamp then also skips any texel the chunk co-owns, so
  // a not-yet-ready neighbour can never cause a seam).
  private getChunkMask(cx: number, cy: number): PaintMask | null {
    const chunk = this.renderer.terrainRenderer.terrainChunks.get(
      `${cx},${cy}`
    );
    if (!chunk) return null;
    const mask = chunk.editableScatterMask(SCATTER_MASK_STEP);
    if (mask) return mask;
    this.ensureMask(chunk);
    return null;
  }

  // Kicks off a chunk's saved-mask lookup so it becomes paintable. Runs once
  // per chunk; by the next pointer event the chunk is editable.
  private ensureMask(chunk: TerrainChunk) {
    if (chunk.scatterMask || this.pendingResolves.has(chunk.id)) return;
    this.pendingResolves.add(chunk.id);

    chunk
      .resolveScatterMask(this.renderer.terrainRenderer.scatterMaskProvider)
      .finally(() => {
        this.pendingResolves.delete(chunk.id);
      });
  }
}
