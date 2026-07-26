import { Color, Vector3 } from 'rewild-common';
import { Renderer, Transform, resolveClimatePreset } from 'rewild-renderer';
import {
  applyPaintStamp,
  BIOME_MASK_STEP,
  PaintBrushType,
  PaintMask,
  PaintMaskSource,
} from 'rewild-renderer/lib/renderers/terrain/PaintMask';
import { TerrainChunk } from 'rewild-renderer/lib/renderers/terrain/TerrainChunk';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';
import { writeBiomeMask } from 'src/database/biome-masks';
import { projectStore } from 'src/ui/stores/ProjectStore';
import { biomePaintStore } from 'src/ui/stores/BiomePaintStore';
import { BrushCursor, pickTerrain } from './BrushCursor';

// Stamp pacing, mirroring the sculpt controller: amounts are time-scaled so
// painting feels the same at any pointer-event rate, and dt is clamped so a
// stall doesn't produce one giant stamp.
const MAX_STAMP_DT = 0.1; // seconds
// Blend fraction per second at strength 1, brush centre. Slower than the
// sculpt brush's: a biome border is a large, soft thing and a fast brush makes
// it trivially easy to slam a whole region to full weight in one pass.
const PAINT_RATE = 2.5;

interface StrokeState {
  // Chunks touched so far, with the mask each will be saved from.
  touched: Map<string, { cx: number; cy: number; mask: PaintMask }>;
  erase: boolean;
  lastStampTime: number;
}

/**
 * Editor biome painting. The material half of terrain authoring: a stroke edits
 * which biome the climate model is overridden to at each texel, and the chunk's
 * splat map is regenerated from it.
 *
 * Structurally the sculpt controller's twin — same stroke lifecycle, same
 * skip-unresolved-chunks rule, same save-on-pointer-up — with one important
 * difference: painting changes no geometry, so nothing is re-meshed and no
 * terrain worker is involved. Each stamp resolves only the splat texels under
 * the brush and uploads only that rectangle, which is what keeps a stroke over
 * a 300-unit brush interactive.
 */
export class TerrainBiomePaintController {
  private stroke: StrokeState | null = null;
  // Chunks whose mask lookup we've kicked off so they become paintable;
  // getMask skips them until the lookup lands.
  private pendingResolves = new Set<string>();
  private scratchIntersections: Intersection[] = [];
  private scratchTransforms: Transform[] = [];
  private cursor: BrushCursor;
  private source: PaintMaskSource;

  constructor(private renderer: Renderer) {
    const controller = this;
    this.cursor = new BrushCursor(
      renderer,
      // Cyan against the sculpt brush's orange — the two tools own the same
      // left-drag, so the ring has to say which one is armed.
      new Color(0.2, 0.85, 0.9),
      'BiomePaintBrushCursor'
    );
    this.source = {
      get chunkSize() {
        return controller.renderer.terrainRenderer.mapChunkSizeLod;
      },
      get metersPerSample() {
        return controller.renderer.terrainRenderer.metersPerSample;
      },
      step: BIOME_MASK_STEP,
      get channels() {
        return controller.biomeCount;
      },
      getMask: (cx: number, cy: number) => this.getChunkMask(cx, cy),
    };
  }

  get isPainting() {
    return this.stroke !== null;
  }

  /** Biomes of the terrain's active climate — the set a mask can address. */
  get biomeCount(): number {
    return resolveClimatePreset(this.renderer.terrainRenderer.climatePreset)
      .biomes.length;
  }

  updateCursor(point: Vector3 | null) {
    this.cursor.update(point, biomePaintStore.radius);
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
        'No levelId on the current project — biome paint not saved.'
      );
      return;
    }

    await Promise.all(
      [...stroke.touched.values()].map((t) =>
        writeBiomeMask(levelId, t.cx, t.cy, t.mask)
      )
    );

    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });
  }

  /**
   * Warms up chunks under the brush before/while painting: chunks whose masks
   * aren't in memory yet get their lookup kicked off so they are paintable by
   * the time the stroke reaches them.
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
        if (chunk && !chunk.biomeMask) this.ensureMask(chunk);
      }
    }
  }

  private stamp(point: Vector3, dt: number) {
    const stroke = this.stroke;
    if (!stroke) return;

    const type: PaintBrushType = stroke.erase ? 'erase' : biomePaintStore.brush;
    const radius = biomePaintStore.radius;
    const amount = Math.min(1, biomePaintStore.strength * PAINT_RATE * dt);

    const touched = applyPaintStamp(this.source, {
      type,
      channel: biomePaintStore.biome,
      centerX: point.x,
      centerZ: point.z,
      radius,
      amount,
    });

    const terrain = this.renderer.terrainRenderer;
    // The mask is sampled bilinearly at BIOME_MASK_STEP samples per texel, so a
    // painted texel colours the splat up to one texel beyond the brush edge.
    // Inflate the repaint window to cover that, or the disc leaves a stale ring.
    const splatRadius = radius + BIOME_MASK_STEP * terrain.metersPerSample;

    for (const t of touched) {
      const key = `${t.cx},${t.cy}`;
      if (!stroke.touched.has(key)) stroke.touched.set(key, t);

      const chunk = terrain.terrainChunks.get(key);
      if (chunk) chunk.bumpMaskVersion();

      const window = terrain.splatWindowForDisc(
        t.cx,
        t.cy,
        point.x,
        point.z,
        splatRadius
      );
      if (window) terrain.refreshChunkSplat(t.cx, t.cy, window);
    }
  }

  // Resolves a chunk's editable mask for the current stamp, or null to skip it
  // this stamp (applyPaintStamp then also skips any texel the chunk co-owns, so
  // a not-yet-ready neighbour can never cause a seam).
  private getChunkMask(cx: number, cy: number): PaintMask | null {
    const chunk = this.renderer.terrainRenderer.terrainChunks.get(
      `${cx},${cy}`
    );
    // Chunk objects exist well beyond raycast range; if one is somehow missing,
    // skipping keeps every write consistent with what will be saved.
    if (!chunk) return null;
    const mask = chunk.editableBiomeMask(this.biomeCount, BIOME_MASK_STEP);
    if (mask) return mask;
    this.ensureMask(chunk);
    return null;
  }

  // Kicks off a chunk's saved-mask lookup so it becomes paintable. Runs once
  // per chunk; by the next pointer event the chunk is editable.
  private ensureMask(chunk: TerrainChunk) {
    if (chunk.biomeMask || this.pendingResolves.has(chunk.id)) return;
    this.pendingResolves.add(chunk.id);

    chunk
      .resolveBiomeMask(
        this.renderer.terrainRenderer.biomeMaskProvider,
        this.biomeCount
      )
      .finally(() => {
        this.pendingResolves.delete(chunk.id);
      });
  }
}
