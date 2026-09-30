import { smoothstep } from 'rewild-common';
import { Lake, OCEAN_BODY_ID } from './Lakes';
import { MAX_WATER_TYPES } from './Water';
import {
  TouchedWaterChunk,
  WATER_EDIT_AUTHORITY,
  WATER_EDIT_COVERAGE,
  WATER_EDIT_TYPES,
  WaterEdit,
} from './WaterEdit';
import { ResolvedWater, WATER_MAP_STEP } from './WaterMap';

// The edit rules' search for where a lake would overflow, and the drain that
// keeps it at or below that height.
//
// Everything runs on the world grid of water map texels: texel (i, j) sits on
// the sample-space point (i · step, j · step), the space the sculpt brush works
// in (see Sculpt.ts). A texel on a chunk edge belongs to every chunk that
// shares it, reads the same from each, and is written to all of them.

export interface WaterRuleChunk {
  /** LOD-0 heights. */
  heights: Float32Array;
  water: ResolvedWater;
}

export interface WaterRuleSource {
  /** LOD-0 samples per chunk side. */
  chunkSize: number;
  seaLevel: number;
  /** Lake cell side in samples. The flood stays in the body's cell and its
   *  neighbours. */
  cellSize: number;
  /** A chunk's heights and water, or null while it is not resolved. */
  getChunk(cx: number, cy: number): WaterRuleChunk | null;
}

/** Supplies the edits a drain writes: the chunk's mutable edit, or null while
 *  it is not resolved. */
export type WaterRuleEdits = (cx: number, cy: number) => WaterEdit | null;

const STEP = WATER_MAP_STEP;

// Texel coordinates packed into one number, exact for |i|, |j| < 2^20.
const ID_OFFSET = 1 << 20;
const ID_STRIDE = 1 << 21;

export function texelId(i: number, j: number): number {
  return (i + ID_OFFSET) * ID_STRIDE + (j + ID_OFFSET);
}

function texelI(id: number): number {
  return Math.floor(id / ID_STRIDE) - ID_OFFSET;
}

function texelJ(id: number): number {
  return (id % ID_STRIDE) - ID_OFFSET;
}

const COLLECTED = 1;
const QUEUED = 2;
const POPPED = 4;
const BASIN = 8;

// Reads texels across chunks, and keeps a flag byte per texel. Records the
// first chunk it needed and could not get.
class TexelGrid {
  private span: number;
  private half: number;
  private size: number;
  private cx = NaN;
  private cy = NaN;
  private chunk: WaterRuleChunk | null = null;
  private tile: Uint8Array | null = null;
  private tiles = new Map<string, Uint8Array>();
  t = 0;
  missing = false;
  missingX = 0;
  missingY = 0;

  constructor(private source: WaterRuleSource) {
    this.span = source.chunkSize - 1;
    this.half = this.span / 2;
    this.size = this.span / STEP + 1;
  }

  select(i: number, j: number): boolean {
    const { span, half, size } = this;
    const wx = i * STEP;
    const wz = j * STEP;
    const cx = Math.floor((wx + half) / span);
    const cy = Math.floor((wz + half) / span);
    if (cx !== this.cx || cy !== this.cy) {
      this.cx = cx;
      this.cy = cy;
      this.chunk = this.source.getChunk(cx, cy);
      const key = `${cx},${cy}`;
      let tile = this.tiles.get(key);
      if (!tile) {
        tile = new Uint8Array(size * size);
        this.tiles.set(key, tile);
      }
      this.tile = tile;
    }
    if (!this.chunk) {
      if (!this.missing) {
        this.missing = true;
        this.missingX = cx;
        this.missingY = cy;
      }
      return false;
    }
    const mx = (wx - cx * span + half) / STEP;
    const my = (cy * span + half - wz) / STEP;
    this.t = my * size + mx;
    return true;
  }

  height(): number {
    const size = this.source.chunkSize;
    const x = (this.t % this.size) * STEP;
    const y = Math.floor(this.t / this.size) * STEP;
    return this.chunk!.heights[y * size + x];
  }

  coverage(): number {
    return this.chunk!.water.coverage[this.t];
  }

  level(): number {
    return this.chunk!.water.levels[this.t];
  }

  bodyId(): number {
    return this.chunk!.water.bodyIds[this.t];
  }

  water(): ResolvedWater {
    return this.chunk!.water;
  }

  type(c: number): number {
    return this.chunk!.water.typeWeights[this.t * 4 + c];
  }

  flags(): number {
    return this.tile![this.t];
  }

  mark(flag: number) {
    this.tile![this.t] |= flag;
  }
}

// A binary min-heap of texel ids keyed by height.
class TexelHeap {
  private keys = new Float64Array(1024);
  private ids = new Float64Array(1024);
  size = 0;
  lastKey = 0;

  push(id: number, key: number) {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      const ids = new Float64Array(this.size * 2);
      keys.set(this.keys);
      ids.set(this.ids);
      this.keys = keys;
      this.ids = ids;
    }
    const { keys, ids } = this;
    let n = this.size++;
    while (n > 0) {
      const parent = (n - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[n] = keys[parent];
      ids[n] = ids[parent];
      n = parent;
    }
    keys[n] = key;
    ids[n] = id;
  }

  pop(): number {
    const { keys, ids } = this;
    const id = ids[0];
    this.lastKey = keys[0];
    const last = --this.size;
    const key = keys[last];
    const lastId = ids[last];
    let n = 0;
    for (;;) {
      let child = 2 * n + 1;
      if (child >= last) break;
      if (child + 1 < last && keys[child + 1] < keys[child]) child++;
      if (keys[child] >= key) break;
      keys[n] = keys[child];
      ids[n] = ids[child];
      n = child;
    }
    keys[n] = key;
    ids[n] = lastId;
    return id;
  }
}

/** The body a texel touch found, and what its first texel holds. */
export interface BodyTouch {
  id: number;
  /** Its texels in the scanned box, as texelIds. */
  starts: number[];
  level: number;
  /** Palette weights, 0..1. */
  typeWeights: number[];
  /** The generated lakes that reach the chunk it was found in. */
  lakes: Lake[];
}

export interface BodyScan {
  status: 'found' | 'missing';
  missingX: number;
  missingY: number;
  bodies: BodyTouch[];
}

/** Every body other than the ocean that owns a texel in [i0, i1] × [j0, j1]. */
export function findBodies(
  source: WaterRuleSource,
  i0: number,
  j0: number,
  i1: number,
  j1: number
): BodyScan {
  const grid = new TexelGrid(source);
  const bodies = new Map<number, BodyTouch>();
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (!grid.select(i, j))
        return {
          status: 'missing',
          missingX: grid.missingX,
          missingY: grid.missingY,
          bodies: [],
        };
      const id = grid.bodyId();
      if (id === OCEAN_BODY_ID) continue;
      let body = bodies.get(id);
      if (!body) {
        const typeWeights = new Array<number>(MAX_WATER_TYPES);
        for (let c = 0; c < MAX_WATER_TYPES; c++)
          typeWeights[c] = grid.type(c) / 255;
        body = {
          id,
          starts: [],
          level: grid.level(),
          typeWeights,
          lakes: grid.water().lakes,
        };
        bodies.set(id, body);
      }
      body.starts.push(texelId(i, j));
    }
  return {
    status: 'found',
    missingX: 0,
    missingY: 0,
    bodies: [...bodies.values()],
  };
}

const NEIGHBOUR_I = [1, -1, 0, 0];
const NEIGHBOUR_J = [0, 0, 1, -1];

export interface SpillSearch {
  /** `missing` names a chunk to resolve before searching again. `dry` has no
   *  water below the level to start from. */
  status: 'found' | 'missing' | 'dry';
  missingX: number;
  missingY: number;
  /** World height the body would overflow at. */
  spillHeight: number;
  /** It overflows into the sea at or below sea level. */
  sea: boolean;
  /** The flood reached the edge of the search before any outlet. */
  edge: boolean;
  /** Every texel the body owns, as texelIds. */
  bodyTexels: number[];
  /** The body's texels below the spill height that drain through the
   *  outlet. */
  basin: Set<number>;
}

function missingSearch(grid: TexelGrid): SpillSearch {
  return {
    status: 'missing',
    missingX: grid.missingX,
    missingY: grid.missingY,
    spillHeight: NaN,
    sea: false,
    edge: false,
    bodyTexels: [],
    basin: new Set(),
  };
}

/**
 * Finds the spill height of body `bodyId` at `level`, which owns the texels
 * `starts` (texelIds). The body is every texel it owns connected to them; the
 * flood starts from those under water. It always grows the lowest texel next,
 * keeping the highest ground it crossed, until it reaches lower ground, the
 * sea, or the edge of the body's lake cell and its neighbours. Another body's
 * water counts as ground at its surface.
 */
export function findSpillHeight(
  source: WaterRuleSource,
  bodyId: number,
  level: number,
  starts: readonly number[]
): SpillSearch {
  const grid = new TexelGrid(source);
  const seaLevel = source.seaLevel;
  const reach = Math.ceil((source.cellSize * 2) / STEP);

  // The body: the texels it owns connected to the starts, bounded by two cells.
  const bodyTexels: number[] = [];
  const seeds: number[] = [];
  let si = 0;
  let sj = 0;
  if (starts.length === 0) return dry();
  const i0 = texelI(starts[0]) - reach;
  const i1 = texelI(starts[0]) + reach;
  const j0 = texelJ(starts[0]) - reach;
  const j1 = texelJ(starts[0]) + reach;
  const stack: number[] = [];
  for (const id of starts) {
    if (!grid.select(texelI(id), texelJ(id))) return missingSearch(grid);
    if (grid.bodyId() !== bodyId || grid.flags() & COLLECTED) continue;
    grid.mark(COLLECTED);
    stack.push(id);
  }
  while (stack.length > 0) {
    const id = stack.pop()!;
    const i = texelI(id);
    const j = texelJ(id);
    grid.select(i, j);
    bodyTexels.push(id);
    if (grid.coverage() > 0 && grid.height() < level) {
      seeds.push(id);
      si += i;
      sj += j;
    }
    for (let n = 0; n < 4; n++) {
      const ni = i + NEIGHBOUR_I[n];
      const nj = j + NEIGHBOUR_J[n];
      if (ni < i0 || ni > i1 || nj < j0 || nj > j1) continue;
      if (!grid.select(ni, nj)) return missingSearch(grid);
      if (grid.bodyId() !== bodyId || grid.flags() & COLLECTED) continue;
      grid.mark(COLLECTED);
      stack.push(texelId(ni, nj));
    }
  }
  if (seeds.length === 0) return dry();

  // The search area: the lake cell holding the seeds' centre, and its
  // neighbours. Lake space is (x − 0.5, −z − 0.5) in samples.
  const cell = source.cellSize;
  const cellX = Math.floor(((si / seeds.length) * STEP - 0.5) / cell);
  const cellY = Math.floor((-(sj / seeds.length) * STEP - 0.5) / cell);
  const fi0 = Math.ceil(((cellX - 1) * cell + 0.5) / STEP);
  const fi1 = Math.floor(((cellX + 2) * cell + 0.5) / STEP);
  const fj0 = Math.ceil((-(cellY + 2) * cell - 0.5) / STEP);
  const fj1 = Math.floor((-(cellY - 1) * cell - 0.5) / STEP);

  const effective = (): number => {
    const height = grid.height();
    const id = grid.bodyId();
    if (id === bodyId || id === OCEAN_BODY_ID || grid.coverage() === 0)
      return height;
    return Math.max(height, grid.level());
  };

  const heap = new TexelHeap();
  const parents = new Map<number, number>();
  for (const id of seeds) {
    grid.select(texelI(id), texelJ(id));
    grid.mark(QUEUED);
    heap.push(id, grid.height());
  }

  let outlet = NaN;
  let tracked = -Infinity;
  let spillHeight = NaN;
  let sea = false;
  let edge = false;
  while (heap.size > 0) {
    const id = heap.pop();
    const height = heap.lastKey;
    const i = texelI(id);
    const j = texelJ(id);
    grid.select(i, j);
    const ocean =
      grid.bodyId() === OCEAN_BODY_ID &&
      grid.coverage() > 0 &&
      grid.height() < seaLevel;
    if (ocean || height < tracked) {
      sea = ocean && tracked <= seaLevel;
      spillHeight = ocean ? Math.max(tracked, seaLevel) : tracked;
      outlet = id;
      break;
    }
    tracked = height;
    grid.mark(POPPED);
    if (i <= fi0 || i >= fi1 || j <= fj0 || j >= fj1) {
      spillHeight = tracked;
      edge = true;
      outlet = id;
      break;
    }
    for (let n = 0; n < 4; n++) {
      const ni = i + NEIGHBOUR_I[n];
      const nj = j + NEIGHBOUR_J[n];
      if (!grid.select(ni, nj)) return missingSearch(grid);
      if (grid.flags() & QUEUED) continue;
      grid.mark(QUEUED);
      parents.set(texelId(ni, nj), id);
      heap.push(texelId(ni, nj), effective());
    }
  }
  if (Number.isNaN(spillHeight)) spillHeight = tracked;

  // The basin drains through the outlet: the body's texels below the spill
  // height reached from the flood's path to it. Everything the flood took
  // before it overflowed lies on the lake's side, so the basin grows through
  // those at or below the spill height; a lake that joins the sea below its
  // rim grows through its own texels too, as the flood stopped short of them.
  // Hollows cut off at the spill height are left out.
  const basin = new Set<number>();
  if (!Number.isNaN(outlet)) {
    let id: number | undefined = edge ? outlet : parents.get(outlet);
    while (id !== undefined) {
      grid.select(texelI(id), texelJ(id));
      grid.mark(BASIN);
      stack.push(id);
      id = parents.get(id);
    }
  }
  while (stack.length > 0) {
    const id = stack.pop()!;
    const i = texelI(id);
    const j = texelJ(id);
    grid.select(i, j);
    if (grid.bodyId() === bodyId && grid.height() < spillHeight) basin.add(id);
    for (let n = 0; n < 4; n++) {
      const ni = i + NEIGHBOUR_I[n];
      const nj = j + NEIGHBOUR_J[n];
      if (!grid.select(ni, nj) || grid.flags() & BASIN) continue;
      const reached =
        grid.flags() & POPPED || (sea && grid.bodyId() === bodyId);
      if (!reached || effective() > spillHeight) continue;
      grid.mark(BASIN);
      stack.push(texelId(ni, nj));
    }
  }

  return {
    status: 'found',
    missingX: 0,
    missingY: 0,
    spillHeight,
    sea,
    edge,
    bodyTexels,
    basin,
  };

  function dry(): SpillSearch {
    return {
      status: 'dry',
      missingX: 0,
      missingY: 0,
      spillHeight: NaN,
      sea: false,
      edge: false,
      bodyTexels,
      basin: new Set(),
    };
  }
}

export interface DrainResult {
  /** `missing` names a chunk whose edit must resolve first; nothing was
   *  written. */
  status: 'drained' | 'missing';
  missingX: number;
  missingY: number;
  touched: TouchedWaterChunk[];
}

// A joined lake's water is lake water out to this share of the way from its
// shore to its deepest point, then blends to sea water at the shore.
const JOIN_BLEND_FROM = 0.8;

/**
 * Drops the body a search found to `level`, writing it into the water edits
 * with full authority so it overrides the generated water. The body keeps its
 * water where the basin lies, and a texel either side of it for the shoreline;
 * its other texels go dry. All of them take the new level. `joined` blends the
 * palette from its own water to `oceanType` at the shore, as a lagoon's.
 */
export function drainBody(
  source: WaterRuleSource,
  edits: WaterRuleEdits,
  bodyId: number,
  search: SpillSearch,
  level: number,
  joined: boolean,
  oceanType: number
): DrainResult {
  const span = source.chunkSize - 1;
  const half = span / 2;
  const grid = new TexelGrid(source);
  const { bodyTexels, basin } = search;

  for (const id of bodyTexels) {
    const wx = texelI(id) * STEP;
    const wz = texelJ(id) * STEP;
    for (
      let cy = Math.ceil((wz - half) / span);
      cy <= Math.floor((wz + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((wx - half) / span);
        cx <= Math.floor((wx + half) / span);
        cx++
      )
        if (!edits(cx, cy))
          return { status: 'missing', missingX: cx, missingY: cy, touched: [] };
  }

  const kept = new Set<number>();
  for (const id of bodyTexels) {
    const i = texelI(id);
    const j = texelJ(id);
    let keep = basin.has(id);
    for (let dj = -1; dj <= 1 && !keep; dj++)
      for (let di = -1; di <= 1 && !keep; di++)
        keep = basin.has(texelId(i + di, j + dj));
    if (keep) kept.add(id);
  }

  // Steps from the shore, for a joined lake's palette.
  const shore = new Map<number, number>();
  let deepest = 1;
  if (joined) {
    let front: number[] = [];
    for (const id of kept) {
      const i = texelI(id);
      const j = texelJ(id);
      for (let n = 0; n < 4; n++)
        if (!kept.has(texelId(i + NEIGHBOUR_I[n], j + NEIGHBOUR_J[n]))) {
          shore.set(id, 0);
          front.push(id);
          break;
        }
    }
    for (let d = 1; front.length > 0; d++) {
      const next: number[] = [];
      for (const id of front) {
        const i = texelI(id);
        const j = texelJ(id);
        for (let n = 0; n < 4; n++) {
          const nid = texelId(i + NEIGHBOUR_I[n], j + NEIGHBOUR_J[n]);
          if (!kept.has(nid) || shore.has(nid)) continue;
          shore.set(nid, d);
          next.push(nid);
          deepest = d;
        }
      }
      front = next;
    }
  }

  const touched = new Map<string, TouchedWaterChunk>();
  const types = new Uint8Array(MAX_WATER_TYPES);
  for (const id of bodyTexels) {
    const i = texelI(id);
    const j = texelJ(id);
    if (!grid.select(i, j))
      return {
        status: 'missing',
        missingX: grid.missingX,
        missingY: grid.missingY,
        touched: [],
      };
    const keep = kept.has(id);
    const coverage = keep ? grid.coverage() : 0;
    const toSea = joined
      ? smoothstep(1 - (shore.get(id) ?? 0) / deepest, 1 - JOIN_BLEND_FROM, 1)
      : 0;
    for (let c = 0; c < MAX_WATER_TYPES; c++) {
      const own = coverage > 0 ? grid.type(c) : 0;
      const sea = coverage > 0 && c === oceanType ? 255 : 0;
      types[c] = Math.round(own + (sea - own) * toSea);
    }

    const wx = i * STEP;
    const wz = j * STEP;
    for (
      let cy = Math.ceil((wz - half) / span);
      cy <= Math.floor((wz + half) / span);
      cy++
    )
      for (
        let cx = Math.ceil((wx - half) / span);
        cx <= Math.floor((wx + half) / span);
        cx++
      ) {
        const edit = edits(cx, cy)!;
        const size = edit.mask.size;
        const plane = size * size;
        const t =
          ((cy * span + half - wz) / STEP) * size +
          (wx - cx * span + half) / STEP;
        const weights = edit.mask.weights;
        weights[WATER_EDIT_AUTHORITY * plane + t] = 255;
        weights[WATER_EDIT_COVERAGE * plane + t] = coverage;
        for (let c = 0; c < MAX_WATER_TYPES; c++)
          weights[(WATER_EDIT_TYPES + c) * plane + t] = types[c];
        edit.level[t] = level;
        edit.bodyIds[t] = bodyId;
        const key = `${cx},${cy}`;
        if (!touched.has(key)) touched.set(key, { cx, cy, edit });
      }
  }
  return {
    status: 'drained',
    missingX: 0,
    missingY: 0,
    touched: [...touched.values()],
  };
}

/**
 * Per texel of `water`, the level of the locked body whose ground it lies on,
 * or -Infinity: every texel a body in `locked` (id → level) owns, and those
 * next to them. Null when the chunk holds no locked body.
 */
export function lockedLevels(
  water: ResolvedWater,
  locked: ReadonlyMap<number, number>
): Float32Array | null {
  const { size, bodyIds } = water;
  let levels: Float32Array | null = null;
  for (let my = 0; my < size; my++)
    for (let mx = 0; mx < size; mx++) {
      const level = locked.get(bodyIds[mx + my * size]);
      if (level === undefined) continue;
      if (!levels) levels = new Float32Array(size * size).fill(-Infinity);
      for (let y = Math.max(0, my - 1); y <= Math.min(size - 1, my + 1); y++)
        for (let x = Math.max(0, mx - 1); x <= Math.min(size - 1, mx + 1); x++)
          if (level > levels[x + y * size]) levels[x + y * size] = level;
    }
  return levels;
}
