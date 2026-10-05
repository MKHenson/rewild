import { Color, Vector3 } from 'rewild-common';
import { Renderer, Transform, resolveClimatePreset } from 'rewild-renderer';
import type { WaterBody } from 'rewild-renderer/lib/renderers/terrain/Lakes';
import {
  LAKE_WATER,
  MAX_WATER_TYPES,
  OCEAN_WATER,
  getWaterTypeIndex,
} from 'rewild-renderer/lib/renderers/terrain/Water';
import {
  TouchedWaterChunk,
  WATER_EDIT_STEP,
  WaterEditSource,
  WaterGuard,
  WaterStampType,
  applyWaterStamp,
  buildWaterGuard,
  editedBody,
  editedBodyId,
} from 'rewild-renderer/lib/renderers/terrain/WaterEdit';
import {
  SHORE_REACH,
  WATER_COVER_MARGIN,
  applyCarveStamp,
  applyRaiseStamp,
  applyWaterLip,
  buildShoreGrid,
  buildWaterLevels,
  WaterLevels,
} from 'rewild-renderer/lib/renderers/terrain/WaterCarve';
import type {
  SculptHeightSource,
  TouchedChunk,
} from 'rewild-renderer/lib/renderers/terrain/Sculpt';
import {
  ResolvedWater,
  SWASH_REACH,
} from 'rewild-renderer/lib/renderers/terrain/WaterMap';
import { Raycaster, Intersection } from 'rewild-renderer/lib/core/Raycaster';
import { writeChunkSnapshot } from 'src/database/chunk-snapshots';
import { writeWaterBodies } from 'src/database/water-bodies';
import { writeWaterEdit } from 'src/database/water-edits';
import { projectStore } from 'src/ui/stores/ProjectStore';
import { waterBrushStore } from 'src/ui/stores/WaterBrushStore';
import { BrushCursor, pickTerrain } from './BrushCursor';
import { ChunkHeightLoader } from './ChunkHeights';

// Stamp pacing, mirroring the paint brushes.
const MAX_STAMP_DT = 0.1; // seconds
const PAINT_RATE = 2.5;
// Metres the level brush moves per pixel of vertical drag at strength 1.
const LEVEL_RATE = 0.1;

interface PaintStroke {
  kind: 'paint';
  type: WaterStampType;
  touched: Map<string, TouchedWaterChunk>;
  // Each chunk's water when the stroke first reached it, for the type brush.
  resolved: Map<string, ResolvedWater | null>;
  level: number;
  bodyId: number;
  typeWeights: number[];
  // The record of a body this stroke made on dry land.
  newBody: WaterBody | null;
  // Chunks whose heights an add or remove stroke carved or raised.
  heights: Map<string, TouchedChunk>;
  // The add stroke's stamps, as (x, z, radius) triples.
  discs: number[];
  // Chunks' heights as they stood when the add stroke first reached them.
  originals: Map<string, Float32Array>;
  // The add stroke's bed per chunk, which its stamps dig toward.
  targets: Map<string, Float32Array>;
  lastStampTime: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface LevelStroke {
  kind: 'level';
  x: number;
  z: number;
  startY: number;
  startLevel: number;
  cap: number;
  bodyId: number;
  // Resolves whether a lake lies under the click.
  picking: Promise<boolean>;
  target: number;
  applied: number;
  applying: Promise<void> | null;
  chunks: Map<string, TouchedWaterChunk>;
}

type Stroke = PaintStroke | LevelStroke;

const metres = (value: number) => `${value.toFixed(2)} m`;

/**
 * Editor water brush. Add, remove, reset and type paint the chunks' water
 * edits under the brush like the paint brushes. Add also digs a bed under the
 * water and raises a lip around it when the stroke ends, and stops at other
 * water that shows unless it stands at the same level. Remove raises the ground under
 * the water above its level. After reset, the edit rules settle the water it
 * changed. Level picks the lake under the click
 * and moves its level with a vertical drag, live and capped at its spill
 * height.
 */
export class TerrainWaterBrushController {
  private stroke: Stroke | null = null;
  private scratchIntersections: Intersection[] = [];
  private scratchTransforms: Transform[] = [];
  private cursor: BrushCursor;
  private source: WaterEditSource;
  private heightSource: SculptHeightSource;
  private heights: ChunkHeightLoader;
  private resolvedWater = (cx: number, cy: number) => this.getResolved(cx, cy);
  private originalHeights = (cx: number, cy: number) => {
    const stroke = this.stroke;
    if (stroke?.kind !== 'paint') return null;
    return stroke.originals.get(`${cx},${cy}`) ?? null;
  };
  private strokeTargets = (cx: number, cy: number) => {
    const stroke = this.stroke;
    if (stroke?.kind !== 'paint') return null;
    return stroke.targets.get(`${cx},${cy}`) ?? null;
  };

  constructor(private renderer: Renderer) {
    const controller = this;
    this.cursor = new BrushCursor(
      renderer,
      new Color(0.3, 0.6, 1),
      'WaterBrushCursor'
    );
    this.source = {
      get chunkSize() {
        return controller.renderer.terrainRenderer.mapChunkSizeLod;
      },
      get metersPerSample() {
        return controller.renderer.terrainRenderer.metersPerSample;
      },
      getEdit: (cx: number, cy: number) => this.getChunkEdit(cx, cy),
      getResolved: this.resolvedWater,
    };
    this.heights = new ChunkHeightLoader(renderer);
    this.heightSource = {
      get chunkSize() {
        return controller.renderer.terrainRenderer.mapChunkSizeLod;
      },
      get metersPerSample() {
        return controller.renderer.terrainRenderer.metersPerSample;
      },
      getHeights: (cx: number, cy: number) => this.heights.get(cx, cy),
    };
  }

  get isPainting() {
    return this.stroke !== null;
  }

  /** Whether the brush paints a disc; level acts on a whole lake. */
  get usesRadius() {
    return waterBrushStore.brush !== 'level';
  }

  updateCursor(point: Vector3 | null) {
    this.cursor.update(point, this.usesRadius ? waterBrushStore.radius : 2);
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

  /**
   * Starts a stroke at `point`. Shift swaps add and remove. `screenY` is where
   * the level brush measures its drag from.
   */
  beginStroke(point: Vector3, shift: boolean, screenY: number) {
    const brush = waterBrushStore.brush;
    if (brush === 'level') {
      this.beginLevel(point, screenY);
      return;
    }

    const type: WaterStampType =
      brush === 'type'
        ? 'paint'
        : brush === 'add'
        ? shift
          ? 'remove'
          : 'add'
        : brush === 'remove'
        ? shift
          ? 'add'
          : 'remove'
        : 'reset';
    const stroke: PaintStroke = {
      kind: 'paint',
      type,
      touched: new Map(),
      resolved: new Map(),
      level: 0,
      bodyId: 0,
      typeWeights: this.paletteWeights(
        brush === 'type' ? waterBrushStore.waterType : LAKE_WATER
      ),
      newBody: null,
      heights: new Map(),
      discs: [],
      originals: new Map(),
      targets: new Map(),
      lastStampTime: performance.now(),
      minX: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxZ: -Infinity,
    };
    if (type === 'add' && !this.pickAddTarget(stroke, point)) return;
    this.stroke = stroke;
    // First stamp at a nominal frame's worth of time so a click paints too.
    this.stamp(stroke, point, 1 / 60);
  }

  /** Continues the stroke. The level brush needs only `screenY`, so it keeps
   *  going when the pointer leaves the terrain. */
  moveStroke(point: Vector3 | null, screenY: number) {
    const stroke = this.stroke;
    if (!stroke) return;
    if (stroke.kind === 'level') {
      this.moveLevel(stroke, screenY);
      return;
    }
    if (!point) return;
    const now = performance.now();
    const dt = Math.min((now - stroke.lastStampTime) / 1000, MAX_STAMP_DT);
    stroke.lastStampTime = now;
    if (dt <= 0) return;
    this.stamp(stroke, point, dt);
  }

  /**
   * Ends the stroke: saves the edits it changed, then, for add, remove and
   * reset, settles the water with the edit rules and saves what they changed
   * and the body records.
   */
  async endStroke(): Promise<void> {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return;
    const levelId = projectStore.project?.levelId;
    const rules = this.renderer.terrainRenderer.waterRules;

    if (stroke.kind === 'level') {
      if (!(await stroke.picking)) return;
      while (stroke.applying) await stroke.applying;
      if (!levelId) return this.warnUnsaved();
      await Promise.all([
        ...[...stroke.chunks.values()].map((t) =>
          writeWaterEdit(levelId, t.cx, t.cy, t.edit)
        ),
        writeWaterBodies(levelId, rules.savedBodies()),
      ]);
      this.markDirty();
      return;
    }

    if (stroke.touched.size === 0 && stroke.heights.size === 0) return;
    if (!levelId) return this.warnUnsaved();
    await Promise.all(
      [...stroke.touched.values()].map((t) =>
        writeWaterEdit(levelId, t.cx, t.cy, t.edit)
      )
    );
    if (stroke.newBody) await rules.setRecord(stroke.newBody);

    if (stroke.type === 'add' || stroke.type === 'remove') {
      if (stroke.type === 'add') this.raiseLip(stroke);
      const size = this.renderer.terrainRenderer.mapChunkSizeLod;
      await Promise.all(
        [...stroke.heights.values()].map((t) =>
          writeChunkSnapshot(levelId, t.cx, t.cy, t.heights, size)
        )
      );
      if (stroke.newBody) await writeWaterBodies(levelId, rules.savedBodies());
    } else if (stroke.type === 'reset') {
      const settled = await rules.settle(
        stroke.minX,
        stroke.minZ,
        stroke.maxX,
        stroke.maxZ
      );
      await Promise.all(
        settled.chunks.map((t) => writeWaterEdit(levelId, t.cx, t.cy, t.edit))
      );
      const drained = settled.outcomes.filter((o) => o.drained);
      waterBrushStore.setInfo(
        drained
          .map(
            (o) =>
              `Lake ${o.body.id} drained to ${metres(o.body.level)}${
                o.joined ? ', joining the sea' : ', its rim'
              }.`
          )
          .join(' ')
      );
      if (settled.outcomes.length > 0 || stroke.newBody)
        await writeWaterBodies(levelId, rules.savedBodies());
    }
    this.markDirty();
  }

  /** Reads the saved water edits and heights of chunks under the brush
   *  before a stroke reaches them. */
  prefetchEdits(centerX: number, centerZ: number, radius: number) {
    const terrain = this.renderer.terrainRenderer;
    terrain.waterRules.resolveRecords();
    this.heights.prefetch(centerX, centerZ, radius + SHORE_REACH);
    const span = terrain.chunkSize;
    const half = span / 2;
    for (
      let cy = Math.ceil((centerZ - radius - half) / span);
      cy <= Math.floor((centerZ + radius + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((centerX - radius - half) / span);
        cx <= Math.floor((centerX + radius + half) / span);
        cx++
      )
        terrain.terrainChunks
          .get(`${cx},${cy}`)
          ?.resolveWaterEdit(terrain.waterEditProvider);
  }

  private stamp(stroke: PaintStroke, point: Vector3, dt: number) {
    const radius = waterBrushStore.radius;
    stroke.minX = Math.min(stroke.minX, point.x - radius);
    stroke.minZ = Math.min(stroke.minZ, point.z - radius);
    stroke.maxX = Math.max(stroke.maxX, point.x + radius);
    stroke.maxZ = Math.max(stroke.maxZ, point.z + radius);

    const terrain = this.renderer.terrainRenderer;
    const amount = Math.min(1, waterBrushStore.strength * PAINT_RATE * dt);
    let guard: WaterGuard | undefined;
    if (stroke.type === 'add') {
      const unit = terrain.metersPerSample * WATER_EDIT_STEP;
      const reach = radius + SHORE_REACH;
      guard = buildWaterGuard(
        this.resolvedWater,
        (terrain.mapChunkSizeLod - 1) / WATER_EDIT_STEP,
        Math.floor((point.x - reach) / unit),
        Math.floor((point.z - reach) / unit),
        Math.ceil((point.x + reach) / unit),
        Math.ceil((point.z + reach) / unit),
        stroke.bodyId,
        stroke.level,
        {
          getHeights: (cx, cy) => this.heights.get(cx, cy),
          floor: stroke.level - waterBrushStore.depth,
        }
      );
      stroke.discs.push(point.x, point.z, radius);
    }

    // Read before the stamp takes the water away.
    let levels: WaterLevels | undefined;
    if (stroke.type === 'remove') {
      const unit = terrain.metersPerSample * WATER_EDIT_STEP;
      levels = buildWaterLevels(
        this.resolvedWater,
        (terrain.mapChunkSizeLod - 1) / WATER_EDIT_STEP,
        Math.floor((point.x - radius) / unit),
        Math.floor((point.z - radius) / unit),
        Math.ceil((point.x + radius) / unit),
        Math.ceil((point.z + radius) / unit)
      );
    }

    const touched = applyWaterStamp(this.source, {
      type: stroke.type,
      centerX: point.x,
      centerZ: point.z,
      radius: guard ? radius + WATER_COVER_MARGIN : radius,
      // The ground makes the shoreline, so added water is full at once.
      amount: guard ? 1 : amount,
      hard: !!guard,
      level: stroke.level,
      bodyId: stroke.bodyId,
      typeWeights: stroke.typeWeights,
      guard,
    });
    for (const t of touched) {
      const key = `${t.cx},${t.cy}`;
      if (!stroke.touched.has(key)) stroke.touched.set(key, t);
      terrain.refreshChunkWater(t.cx, t.cy);
    }

    if (guard) {
      this.keepOriginals(stroke, point.x, point.z, radius + SHORE_REACH);
      this.keepHeights(
        stroke,
        applyCarveStamp(this.heightSource, {
          centerX: point.x,
          centerZ: point.z,
          radius,
          level: stroke.level,
          depth: waterBrushStore.depth,
          amount,
          guard,
          original: this.originalHeights,
          targets: this.strokeTargets,
        })
      );
    }
    if (levels)
      this.keepHeights(
        stroke,
        applyRaiseStamp(this.heightSource, {
          centerX: point.x,
          centerZ: point.z,
          radius,
          rise: terrain.waterRules.lakeMargin,
          levels,
        })
      );
  }

  // Raises a lip in the shore apron of an add stroke, to its level plus the
  // lakes' margin.
  private raiseLip(stroke: PaintStroke) {
    const terrain = this.renderer.terrainRenderer;
    const rules = terrain.waterRules;
    const unit = terrain.metersPerSample * WATER_EDIT_STEP;
    const reach = SHORE_REACH + unit;
    // The water and heights as they stood when the stroke began.
    const water = (cx: number, cy: number) =>
      stroke.resolved.get(`${cx},${cy}`) ?? rules.chunkWater(cx, cy);
    const original = (cx: number, cy: number) =>
      stroke.originals.get(`${cx},${cy}`) ?? null;
    const grid = buildShoreGrid(
      water,
      (cx, cy) => original(cx, cy) ?? this.heights.get(cx, cy),
      (terrain.mapChunkSizeLod - 1) / WATER_EDIT_STEP,
      Math.floor((stroke.minX - reach) / unit),
      Math.floor((stroke.minZ - reach) / unit),
      Math.ceil((stroke.maxX + reach) / unit),
      Math.ceil((stroke.maxZ + reach) / unit),
      stroke.bodyId
    );
    this.keepHeights(
      stroke,
      applyWaterLip(
        this.heightSource,
        grid,
        stroke.discs,
        stroke.level,
        rules.lakeMargin,
        original
      )
    );
  }

  // Copies the heights of the chunks under the brush the first time the
  // stroke reaches them, before it changes them, and starts their bed.
  private keepOriginals(
    stroke: PaintStroke,
    x: number,
    z: number,
    radius: number
  ) {
    const span = this.renderer.terrainRenderer.chunkSize;
    const half = span / 2;
    for (
      let cy = Math.ceil((z - radius - half) / span);
      cy <= Math.floor((z + radius + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((x - radius - half) / span);
        cx <= Math.floor((x + radius + half) / span);
        cx++
      ) {
        const key = `${cx},${cy}`;
        if (stroke.originals.has(key)) continue;
        const heights = this.heights.get(cx, cy);
        if (!heights) continue;
        stroke.originals.set(key, heights.slice());
        stroke.targets.set(
          key,
          new Float32Array(heights.length).fill(Infinity)
        );
      }
  }

  private keepHeights(stroke: PaintStroke, touched: TouchedChunk[]) {
    const terrain = this.renderer.terrainRenderer;
    for (const t of touched) {
      const key = `${t.cx},${t.cy}`;
      if (!stroke.heights.has(key)) stroke.heights.set(key, t);
      terrain.remeshChunk(t.cx, t.cy);
    }
  }

  // Adds to the lake under the click at its level, or starts a new one on dry
  // land with its surface at the clicked ground. False while the chunk's water
  // is still being read.
  private pickAddTarget(stroke: PaintStroke, point: Vector3): boolean {
    const terrain = this.renderer.terrainRenderer;
    const span = terrain.chunkSize;
    const cx = Math.round(point.x / span);
    const cy = Math.round(point.z / span);
    const water = terrain.waterRules.chunkWater(cx, cy);
    if (!water) {
      waterBrushStore.setInfo('Reading the water here, try again.');
      return false;
    }
    const unit = terrain.metersPerSample * water.step;
    const mx = Math.round((point.x - cx * span + span / 2) / unit);
    const my = Math.round((cy * span + span / 2 - point.z) / unit);
    const t =
      Math.min(water.size - 1, Math.max(0, my)) * water.size +
      Math.min(water.size - 1, Math.max(0, mx));
    const bodyId = water.bodyIds[t];
    const ground = terrain.sampleHeight(point.x, point.z) ?? point.y;

    // Covered ground above the water is dry: the sea's coverage runs inland of
    // the coast, under land that stands above it.
    if (water.coverage[t] > 0 && ground < water.levels[t] + SWASH_REACH) {
      stroke.bodyId = bodyId;
      stroke.level = water.levels[t];
      if (bodyId === 0) stroke.typeWeights = this.paletteWeights(OCEAN_WATER);
      waterBrushStore.setInfo(
        bodyId === 0
          ? `Adding to the sea at ${metres(stroke.level)}.`
          : `Adding to lake ${bodyId} at ${metres(stroke.level)}.`
      );
      return true;
    }

    stroke.bodyId = editedBodyId(
      Math.imul(Math.round(point.x), 73856093) ^
        Math.imul(Math.round(point.z), 19349663) ^
        Date.now()
    );
    stroke.level = ground;
    stroke.newBody = editedBody(
      stroke.bodyId,
      stroke.level,
      stroke.typeWeights.map((w) => w * 255)
    );
    waterBrushStore.setInfo(
      `New lake ${stroke.bodyId} at ${metres(stroke.level)}.`
    );
    return true;
  }

  private beginLevel(point: Vector3, screenY: number) {
    const rules = this.renderer.terrainRenderer.waterRules;
    const stroke: LevelStroke = {
      kind: 'level',
      x: point.x,
      z: point.z,
      startY: screenY,
      startLevel: 0,
      cap: Infinity,
      bodyId: 0,
      picking: Promise.resolve(false),
      target: NaN,
      applied: NaN,
      applying: null,
      chunks: new Map(),
    };
    stroke.picking = rules.bodyAt(point.x, point.z).then((report) => {
      if (!report) {
        waterBrushStore.setInfo('Click on a lake to set its level.');
        return false;
      }
      const { body } = report;
      stroke.bodyId = body.id;
      stroke.startLevel = body.level;
      stroke.target = body.level;
      stroke.applied = body.level;
      stroke.cap = Number.isNaN(report.spillHeight)
        ? body.spillHeight
        : Math.max(report.spillHeight, body.level);
      this.reportLevel(stroke);
      return true;
    });
    this.stroke = stroke;
  }

  private moveLevel(stroke: LevelStroke, screenY: number) {
    if (Number.isNaN(stroke.target)) return;
    const rate = LEVEL_RATE * waterBrushStore.strength;
    stroke.target = Math.min(
      stroke.cap,
      stroke.startLevel + (stroke.startY - screenY) * rate
    );
    this.reportLevel(stroke);
    if (stroke.applying) return;

    // Latest wins: a drag outruns the rebuilds, so each pass takes the target
    // the drag has reached by then.
    const rules = this.renderer.terrainRenderer.waterRules;
    stroke.applying = (async () => {
      while (stroke.target !== stroke.applied) {
        const target = stroke.target;
        const result = await rules.setLevelAt(
          stroke.x,
          stroke.z,
          target,
          stroke.cap
        );
        stroke.applied = target;
        if (!result) break;
        for (const t of result.chunks) stroke.chunks.set(`${t.cx},${t.cy}`, t);
      }
    })()
      .catch((err) => console.error('Failed to set the lake level:', err))
      .finally(() => {
        stroke.applying = null;
      });
  }

  private reportLevel(stroke: LevelStroke) {
    const capped = stroke.target >= stroke.cap;
    waterBrushStore.setInfo(
      `Lake ${stroke.bodyId}: ${metres(stroke.target)}${
        Number.isFinite(stroke.cap)
          ? ` (spills at ${metres(stroke.cap)}${capped ? ', capped' : ''})`
          : ''
      }`
    );
  }

  private paletteWeights(name: string): number[] {
    const climate = resolveClimatePreset(
      this.renderer.terrainRenderer.climatePreset
    );
    const weights = new Array<number>(MAX_WATER_TYPES).fill(0);
    const index = getWaterTypeIndex(climate, name as typeof LAKE_WATER);
    weights[index >= 0 && index < MAX_WATER_TYPES ? index : 0] = 1;
    return weights;
  }

  // The chunk's water edit for a stamp, or null to skip it until its saved
  // edit has been read.
  private getChunkEdit(cx: number, cy: number) {
    const terrain = this.renderer.terrainRenderer;
    const chunk = terrain.terrainChunks.get(`${cx},${cy}`);
    if (!chunk) return null;
    const edit = chunk.editableWaterEdit();
    if (!edit) chunk.resolveWaterEdit(terrain.waterEditProvider);
    return edit;
  }

  private getResolved(cx: number, cy: number): ResolvedWater | null {
    const stroke = this.stroke;
    if (stroke?.kind !== 'paint') return null;
    const key = `${cx},${cy}`;
    if (!stroke.resolved.has(key)) {
      const water = this.renderer.terrainRenderer.waterRules.chunkWater(cx, cy);
      if (!water) return null;
      stroke.resolved.set(key, water);
    }
    return stroke.resolved.get(key) ?? null;
  }

  private warnUnsaved() {
    console.warn('No levelId on the current project — water edits not saved.');
  }

  private markDirty() {
    projectStore.dirty = true;
    projectStore.dispatcher.dispatch({ kind: 'changed' });
  }
}
