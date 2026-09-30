import { Vector2 } from 'rewild-common';
import { ClimateConfig, resolveClimatePreset } from './Biomes';
import { ChunkSnapshotProvider } from './ChunkSnapshot';
import { OCEAN_BODY_ID, WaterBody, lakeBody, oceanBody } from './Lakes';
import {
  BodyTouch,
  SpillSearch,
  WaterRuleChunk,
  WaterRuleSource,
  drainBody,
  fillSeaChannels,
  findBodies,
  findSpillHeight,
  lockedLevels,
} from './SpillHeight';
import type { TerrainChunk } from './TerrainChunk';
import { OCEAN_WATER, getWaterTypeIndex } from './Water';
import { WaterBodyProvider } from './WaterBodies';
import {
  TouchedWaterChunk,
  WaterEdit,
  WaterEditProvider,
  createWaterEdit,
  isWaterEditValid,
} from './WaterEdit';
import { ResolvedWater, WATER_MAP_STEP, resolveWater } from './WaterMap';

// The edit rules, run on the main thread after the terrain changes. The sea
// fills trenches below sea level that join it. A touched lake whose spill
// height fell below its level drains to it; a locked lake holds its rim up
// instead (see lockedLevels and the sculpt brush's lock source).
//
// The flood reads heights well past what is loaded. A chunk the flood reaches
// takes its in-memory heights, else its saved snapshot, else the generator's
// from a worker, and its water edit from the chunk or the store. A chunk the
// flood lacks is read with its neighbours, and the search runs again. A drain writes edits for
// chunks that are not loaded as well; the caller saves them.

/** What the rules need from the terrain. */
export interface WaterRulesHost {
  terrainChunks: Map<string, TerrainChunk>;
  mapChunkSizeLod: number;
  metersPerSample: number;
  seed: number;
  climatePreset: string;
  seaLevel: number;
  snapshotProvider: ChunkSnapshotProvider | null;
  waterEditProvider: WaterEditProvider | null;
  refreshChunkWater(cx: number, cy: number): boolean;
  generateChunkHeights(cx: number, cy: number): Promise<Float32Array>;
}

export interface WaterBodyOutcome {
  /** The body's record after the rules. */
  body: WaterBody;
  previousLevel: number;
  drained: boolean;
  /** It drained to sea level and joined the ocean. */
  joined: boolean;
  /** The flood reached the edge of its search before an outlet. */
  edge: boolean;
}

export interface WaterSettleResult {
  outcomes: WaterBodyOutcome[];
  /** Texels the sea filled. */
  channelTexels: number;
  /** Chunks whose water edits changed, to save. */
  chunks: TouchedWaterChunk[];
}

/** A body at a point, with its spill height found again. */
export interface WaterBodyReport {
  body: WaterBody;
  /** NaN when no water lies below its level. */
  spillHeight: number;
  sea: boolean;
  edge: boolean;
}

// A lake drains when its spill height falls this many metres below its level.
const DRAIN_TOLERANCE = 0.05;
// How far past a stroke, in texels, a body counts as touched.
const TOUCH_TEXELS = 2;
// The lock margin where a climate has no lakes.
const DEFAULT_LOCK_MARGIN = 1;

// Heights, water and edits of the chunks one run reaches.
class RuleContext implements WaterRuleSource {
  readonly chunkSize: number;
  readonly seaLevel: number;
  readonly cellSize: number;
  private heights = new Map<string, Float32Array>();
  private edits = new Map<string, WaterEdit | null>();
  private loads = new Map<string, Promise<void>>();
  private waters = new Map<string, WaterRuleChunk>();
  // Edits written for chunks that were not loaded when read.
  readonly detached = new Map<string, WaterEdit>();

  constructor(private host: WaterRulesHost, private climate: ClimateConfig) {
    this.chunkSize = host.mapChunkSizeLod;
    this.seaLevel = host.seaLevel;
    this.cellSize = climate.lakes?.cellSize ?? 1600;
  }

  getChunk(cx: number, cy: number): WaterRuleChunk | null {
    const key = `${cx},${cy}`;
    const cached = this.waters.get(key);
    if (cached) return cached;
    const heights = this.heights.get(key);
    if (!heights || !this.edits.has(key)) return null;
    const water = this.resolveWater(cx, cy, this.editOf(key));
    const chunk = { heights, water };
    this.waters.set(key, chunk);
    return chunk;
  }

  resolveWater(cx: number, cy: number, edit: WaterEdit | null): ResolvedWater {
    const span = this.chunkSize - 1;
    return resolveWater(
      this.chunkSize,
      this.host.seed,
      new Vector2(cx * span, cy * span),
      this.climate,
      this.seaLevel,
      edit
    );
  }

  load(cx: number, cy: number): Promise<void> {
    const key = `${cx},${cy}`;
    let loading = this.loads.get(key);
    if (!loading) {
      loading = this.loadHeights(cx, cy).then((heights) => {
        this.heights.set(key, heights);
        return this.loadEdit(cx, cy);
      });
      this.loads.set(key, loading);
    }
    return loading;
  }

  /** Loads a chunk and its neighbours together, as a flood that needs one
   *  soon needs the next. */
  async loadAround(cx: number, cy: number): Promise<void> {
    const loads: Promise<void>[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) loads.push(this.load(cx + dx, cy + dy));
    await Promise.all(loads);
  }

  async loadEdit(cx: number, cy: number): Promise<void> {
    const key = `${cx},${cy}`;
    if (this.edits.has(key)) return;
    const host = this.host;
    const chunk = host.terrainChunks.get(key);
    let edit: WaterEdit | null = null;
    if (chunk) edit = await chunk.resolveWaterEdit(host.waterEditProvider);
    else if (host.waterEditProvider) {
      edit = await host.waterEditProvider(cx, cy).catch(() => null);
      if (edit && !isWaterEditValid(edit, this.chunkSize)) edit = null;
    }
    this.edits.set(key, edit);
  }

  /** The edit a drain writes into, once loadEdit has run for the chunk. */
  editFor(cx: number, cy: number): WaterEdit | null {
    const key = `${cx},${cy}`;
    if (!this.edits.has(key)) return null;
    const chunk = this.host.terrainChunks.get(key);
    if (chunk?.waterEditIsResolved) return chunk.editableWaterEdit();
    let edit = this.detached.get(key);
    if (!edit) {
      edit = this.edits.get(key) ?? createWaterEdit(this.chunkSize);
      this.detached.set(key, edit);
    }
    return edit;
  }

  /** Reads what a write needs of a chunk: its edit when its heights are
   *  already here, else the chunk and its neighbours. */
  ensure(cx: number, cy: number): Promise<void> {
    return this.heights.has(`${cx},${cy}`)
      ? this.loadEdit(cx, cy)
      : this.loadAround(cx, cy);
  }

  /** Drops the water resolved for chunks whose edits changed. */
  invalidate(touched: TouchedWaterChunk[]) {
    for (const t of touched) this.waters.delete(`${t.cx},${t.cy}`);
  }

  private editOf(key: string): WaterEdit | null {
    const chunk = this.host.terrainChunks.get(key);
    if (chunk?.waterEditIsResolved) return chunk.waterEdit;
    return this.detached.get(key) ?? this.edits.get(key) ?? null;
  }

  private async loadHeights(cx: number, cy: number): Promise<Float32Array> {
    const host = this.host;
    const size = this.chunkSize;
    const chunk = host.terrainChunks.get(`${cx},${cy}`);
    if (chunk?.heights) return chunk.heights;

    let heights: Float32Array | null = null;
    if (chunk) heights = await chunk.resolveHeights(host.snapshotProvider);
    else if (host.snapshotProvider) {
      heights = await host.snapshotProvider(cx, cy).catch(() => null);
      if (heights && heights.length !== size * size) heights = null;
    }
    heights ??= await host.generateChunkHeights(cx, cy);
    if (chunk && !chunk.disposed && !chunk.heights)
      chunk.populateHeights(heights);
    return chunk?.heights ?? heights;
  }
}

interface Missing {
  status: string;
  missingX: number;
  missingY: number;
}

// Runs `step` until it stops asking for a chunk, loading each it names.
async function untilLoaded<T extends Missing>(
  step: () => T,
  load: (cx: number, cy: number) => Promise<void>
): Promise<T> {
  let lastX = NaN;
  let lastY = NaN;
  for (;;) {
    const result = step();
    if (result.status !== 'missing') return result;
    if (result.missingX === lastX && result.missingY === lastY)
      throw new Error(`Chunk ${lastX},${lastY} would not load.`);
    lastX = result.missingX;
    lastY = result.missingY;
    await load(lastX, lastY);
  }
}

export class WaterBodyRules {
  private provider: WaterBodyProvider | null = null;
  private records: Map<number, WaterBody> | null = null;
  private recordsLookup: Promise<Map<number, WaterBody>> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private host: WaterRulesHost) {}

  /** Points the rules at a level's saved records, dropping the current ones. */
  setProvider(provider: WaterBodyProvider | null) {
    this.provider = provider;
    this.records = null;
    this.recordsLookup = null;
  }

  /** The level's records, read once. */
  resolveRecords(): Promise<Map<number, WaterBody>> {
    if (this.records) return Promise.resolve(this.records);
    if (!this.recordsLookup) {
      const provider = this.provider;
      this.recordsLookup = (provider ? provider() : Promise.resolve([]))
        .catch((err) => {
          console.warn('Water body records read failed:', err);
          return [] as WaterBody[];
        })
        .then((bodies) => {
          const records = new Map<number, WaterBody>();
          for (const body of bodies) records.set(body.id, body);
          if (this.provider === provider) this.records = records;
          return records;
        });
    }
    return this.recordsLookup;
  }

  /** Every saved record, for writing back. Empty until resolved. */
  savedBodies(): WaterBody[] {
    return this.records ? [...this.records.values()] : [];
  }

  /** Metres above its level a locked body's rim stays. */
  get lockMargin(): number {
    return (
      resolveClimatePreset(this.host.climatePreset).lakes?.margin ??
      DEFAULT_LOCK_MARGIN
    );
  }

  /**
   * The locked levels over a chunk's water texels (see lockedLevels): null
   * where nothing is locked, undefined while the records or the chunk's edit
   * are still being read.
   */
  chunkLockLevels(cx: number, cy: number): Float32Array | null | undefined {
    const records = this.records;
    if (!records) {
      this.resolveRecords();
      return undefined;
    }
    const locked = new Map<number, number>();
    for (const body of records.values())
      if (body.locked) locked.set(body.id, body.level);
    if (locked.size === 0) return null;

    const host = this.host;
    const chunk = host.terrainChunks.get(`${cx},${cy}`);
    if (!chunk) return null;
    if (!chunk.waterEditIsResolved) {
      chunk.resolveWaterEdit(host.waterEditProvider);
      return undefined;
    }
    return lockedLevels(
      resolveWater(
        host.mapChunkSizeLod,
        host.seed,
        chunk.noiseOffset,
        resolveClimatePreset(host.climatePreset),
        host.seaLevel,
        chunk.waterEdit
      ),
      locked
    );
  }

  /**
   * Applies the edit rules over the world box (x0, z0)–(x1, z1). First the sea
   * fills the trenches below sea level that join it, within the box grown by
   * `reach` metres. Then every lake that owns ground in the box has its spill
   * height found again, and drains to it when its level stands above it.
   * Records change in place; the caller saves them and the returned edits.
   * Runs one at a time.
   */
  settle(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    reach = 0
  ): Promise<WaterSettleResult> {
    const run = this.queue.then(() => this.runSettle(x0, z0, x1, z1, reach));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The body that owns the ground at world (x, z), with its spill height
   *  found again. Null on the open ocean. */
  async bodyAt(x: number, z: number): Promise<WaterBodyReport | null> {
    const records = await this.resolveRecords();
    const climate = resolveClimatePreset(this.host.climatePreset);
    const ctx = new RuleContext(this.host, climate);
    const touch = await this.touchAt(ctx, x, z);
    if (!touch) return null;
    const body = this.recordOf(touch, records, climate);
    const search = await untilLoaded(
      () => findSpillHeight(ctx, body.id, body.level, touch.starts),
      (cx, cy) => ctx.loadAround(cx, cy)
    );
    return {
      body,
      spillHeight: search.status === 'found' ? search.spillHeight : NaN,
      sea: search.sea,
      edge: search.edge,
    };
  }

  /** Locks or unlocks the body at world (x, z). Returns its record, or null
   *  on the open ocean. The caller saves the records. */
  async setLockedAt(
    x: number,
    z: number,
    locked: boolean
  ): Promise<WaterBody | null> {
    const records = await this.resolveRecords();
    const climate = resolveClimatePreset(this.host.climatePreset);
    const ctx = new RuleContext(this.host, climate);
    const touch = await this.touchAt(ctx, x, z);
    if (!touch) return null;
    const body = { ...this.recordOf(touch, records, climate), locked };
    records.set(body.id, body);
    return body;
  }

  /** Saves `body` as the record of an edited body, e.g. new water. */
  async setRecord(body: WaterBody): Promise<void> {
    const records = await this.resolveRecords();
    records.set(body.id, body);
  }

  private async touchAt(
    ctx: RuleContext,
    x: number,
    z: number
  ): Promise<BodyTouch | null> {
    const unit = this.host.metersPerSample * WATER_MAP_STEP;
    const i = Math.round(x / unit);
    const j = Math.round(z / unit);
    const scan = await untilLoaded(
      () => findBodies(ctx, i, j, i, j),
      (cx, cy) => ctx.loadAround(cx, cy)
    );
    return scan.bodies[0] ?? null;
  }

  private recordOf(
    touch: BodyTouch,
    records: Map<number, WaterBody>,
    climate: ClimateConfig
  ): WaterBody {
    const saved = records.get(touch.id);
    if (saved) return saved;
    if (touch.id === OCEAN_BODY_ID)
      return oceanBody(climate, this.host.seaLevel);
    const lake = touch.lakes.find((l) => l.bodyId === touch.id);
    if (lake) return lakeBody(lake, climate);
    return {
      id: touch.id,
      level: touch.level,
      spillHeight: touch.level,
      locked: false,
      typeWeights: touch.typeWeights,
    };
  }

  private async runSettle(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    reach: number
  ): Promise<WaterSettleResult> {
    const host = this.host;
    const records = await this.resolveRecords();
    const climate = resolveClimatePreset(host.climatePreset);
    const oceanType = getWaterTypeIndex(climate, OCEAN_WATER);
    const ctx = new RuleContext(host, climate);
    const unit = host.metersPerSample * WATER_MAP_STEP;
    const load = (cx: number, cy: number) => ctx.loadAround(cx, cy);
    const ensure = (cx: number, cy: number) => ctx.ensure(cx, cy);
    const edits = (cx: number, cy: number) => ctx.editFor(cx, cy);
    const touched = new Map<string, TouchedWaterChunk>();

    const fill = await untilLoaded(
      () =>
        fillSeaChannels(
          ctx,
          edits,
          Math.floor((Math.min(x0, x1) - reach) / unit),
          Math.floor((Math.min(z0, z1) - reach) / unit),
          Math.ceil((Math.max(x0, x1) + reach) / unit),
          Math.ceil((Math.max(z0, z1) + reach) / unit),
          oceanType
        ),
      ensure
    );
    ctx.invalidate(fill.touched);
    for (const t of fill.touched) touched.set(`${t.cx},${t.cy}`, t);

    const scan = await untilLoaded(
      () =>
        findBodies(
          ctx,
          Math.floor(Math.min(x0, x1) / unit) - TOUCH_TEXELS,
          Math.floor(Math.min(z0, z1) / unit) - TOUCH_TEXELS,
          Math.ceil(Math.max(x0, x1) / unit) + TOUCH_TEXELS,
          Math.ceil(Math.max(z0, z1) / unit) + TOUCH_TEXELS
        ),
      load
    );

    const outcomes: WaterBodyOutcome[] = [];
    for (const touch of scan.bodies) {
      const body = this.recordOf(touch, records, climate);
      const search: SpillSearch = await untilLoaded(
        () => findSpillHeight(ctx, body.id, body.level, touch.starts),
        load
      );
      if (search.status !== 'found') continue;

      const spill = search.spillHeight;
      const drains = !body.locked && spill < body.level - DRAIN_TOLERANCE;
      if (drains) {
        const drain = await untilLoaded(
          () =>
            drainBody(
              ctx,
              edits,
              body.id,
              search,
              spill,
              search.sea,
              oceanType
            ),
          ensure
        );
        ctx.invalidate(drain.touched);
        for (const t of drain.touched) touched.set(`${t.cx},${t.cy}`, t);
      }

      const record: WaterBody = {
        ...body,
        level: drains ? spill : body.level,
        spillHeight: spill,
      };
      records.set(record.id, record);
      outcomes.push({
        body: record,
        previousLevel: body.level,
        drained: drains,
        joined: drains && search.sea,
        edge: search.edge,
      });
    }

    for (const t of touched.values()) {
      const key = `${t.cx},${t.cy}`;
      const detached = ctx.detached.get(key);
      const chunk = host.terrainChunks.get(key);
      if (detached && chunk && chunk.waterEdit !== detached)
        chunk.setWaterEdit(detached);
      host.refreshChunkWater(t.cx, t.cy);
    }
    return {
      outcomes,
      channelTexels: fill.texels,
      chunks: [...touched.values()],
    };
  }
}
