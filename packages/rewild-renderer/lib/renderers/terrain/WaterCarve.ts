import { easeOut, smoothstep } from 'rewild-common';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { SculptHeightSource, TouchedChunk, editSamples } from './Sculpt';
import {
  WATER_EDIT_STEP,
  WATER_LEVEL_MATCH,
  WaterGuard,
  isWaterBlocked,
} from './WaterEdit';
import { ResolvedWater, waterShowsAt } from './WaterMap';

// The terrain under the water brush. Adding water fills the brush's circle:
// it digs a bed under it, and a shore apron outside the circle holds the
// coverage past the shoreline and a lip that holds the water, so the ground,
// not the water map's texels, makes the shore. Removing water hands the circle
// back to the generator, and where it cuts water that stays, a bank just
// inside the circle becomes that water's shore.

// Metres a water map texel spans.
const TEXEL = WATER_EDIT_STEP * TERRAIN_METERS_PER_SAMPLE;

/**
 * Metres past the shoreline the add brush paints coverage, so every texel the
 * filtered coverage reads at the shoreline is full.
 */
export const WATER_COVER_MARGIN = TEXEL * 1.5;
/** Metres past the shoreline over which the lip rises to its top. */
export const SHORE_RISE = TEXEL * 0.75;
/**
 * Metres past the shoreline the lip holds its top: past every texel the
 * filtered coverage reaches, so no water shows beyond it.
 */
export const SHORE_CREST = WATER_COVER_MARGIN + TEXEL * Math.SQRT2;
/** Metres past the shoreline the shore apron reaches in all. */
export const SHORE_REACH = TEXEL * 5;

export interface CarveStamp {
  centerX: number;
  centerZ: number;
  /** Brush radius in metres: the water's shoreline. */
  radius: number;
  /** World height of the water's surface. */
  level: number;
  /** Metres the bed lies below the level at the brush centre. */
  depth: number;
  /** Blend fraction (0..1) toward the stroke's bed. */
  amount: number;
  guard: WaterGuard;
  /** A chunk's heights as they stood when the stroke began, which the shore
   *  apron rises to; null to use the heights as they stand. */
  original(cx: number, cy: number): Float32Array | null;
  /**
   * The stroke's bed over a chunk's LOD-0 samples, +Infinity where no stamp
   * has reached, which each stamp lowers to its own shape and the ground moves
   * toward; null to move toward this stamp's shape alone.
   */
  targets(cx: number, cy: number): Float32Array | null;
}

// A per-chunk LOD-0 plane `get` gives, read at world sample (wx, wz) from the
// first chunk that owns it, so shared edge samples have one home.
function chunkPlane(
  chunkSize: number,
  get: (cx: number, cy: number) => Float32Array | null
) {
  const span = chunkSize - 1;
  const half = span / 2;
  const cache = new Map<string, Float32Array | null>();
  let index = 0;
  return {
    /** The plane holding (wx, wz), with `index` set to the sample in it. */
    at(wx: number, wz: number): Float32Array | null {
      const cx = Math.ceil((wx - half) / span);
      const cy = Math.ceil((wz - half) / span);
      const key = `${cx},${cy}`;
      let plane = cache.get(key);
      if (plane === undefined) {
        plane = get(cx, cy);
        cache.set(key, plane);
      }
      index = (cy * span + half - wz) * chunkSize + (wx - cx * span + half);
      return plane;
    },
    get index() {
      return index;
    },
  };
}

/**
 * Digs the ground toward the stroke's bed. A stamp's shape is a bowl `depth`
 * below the level at the centre, rising to the level at the radius, steepest
 * there, then, across the shore apron, rising from the level, steeply at
 * first, to the ground as it stood when the stroke began, which it meets
 * SHORE_REACH past the radius. The stroke's bed is the lowest of its stamps'
 * shapes, and each stamp moves the ground under it `amount` of the way down to
 * that one surface, so strokes deepen with time and leave no ledges. Ground is
 * only lowered, and never where the guard blocks its texel.
 */
export function applyCarveStamp(
  source: SculptHeightSource,
  stamp: CarveStamp
): TouchedChunk[] {
  const { level, depth, guard, radius } = stamp;
  const blend = Math.min(1, stamp.amount);
  if (radius <= 0 || blend <= 0) return [];
  const reach = radius + SHORE_REACH;

  const mps = source.metersPerSample ?? 1;
  const originals = chunkPlane(source.chunkSize, stamp.original);
  const targets = chunkPlane(source.chunkSize, stamp.targets);

  const centerX = stamp.centerX / mps;
  const centerZ = stamp.centerZ / mps;
  const outer = reach / mps;
  return editSamples(
    source,
    Math.ceil(centerX - outer),
    Math.ceil(centerZ - outer),
    Math.floor(centerX + outer),
    Math.floor(centerZ + outer),
    (wx, wz, v) => {
      const d = Math.hypot(wx - centerX, wz - centerZ) * mps;
      if (d >= reach) return v;
      if (
        isWaterBlocked(
          guard,
          Math.round(wx / WATER_EDIT_STEP),
          Math.round(wz / WATER_EDIT_STEP)
        )
      )
        return v;
      let shape: number;
      if (d < radius) shape = level - depth * (1 - (d / radius) * (d / radius));
      else {
        const before = originals.at(wx, wz);
        const ground = before ? before[originals.index] : v;
        shape = level + (ground - level) * easeOut(d - radius, 0, SHORE_REACH);
      }
      let target = shape;
      const plane = targets.at(wx, wz);
      if (plane) {
        const i = targets.index;
        if (shape < plane[i]) plane[i] = shape;
        target = plane[i];
      }
      if (target >= v) return v;
      return v + (target - v) * blend;
    }
  );
}

/**
 * World texels near a stroke, as they stood when it began: `wet` is 1 where
 * another body's water shows, or the water is not known; `own` is 1 where the
 * stroke's body covers the texel.
 */
export interface ShoreGrid {
  i0: number;
  j0: number;
  width: number;
  height: number;
  wet: Uint8Array;
  own: Uint8Array;
}

/**
 * The shore grid over world texels (i0, j0)–(i1, j1) for a stroke adding to
 * `bodyId`. `span` is a chunk's width in texels. Another body's covered water
 * counts as dry where it does not show over `getHeights` (see waterShowsAt),
 * and as wet while a chunk's heights are read.
 */
export function buildShoreGrid(
  getWater: (cx: number, cy: number) => ResolvedWater | null,
  getHeights: (cx: number, cy: number) => Float32Array | null,
  span: number,
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  bodyId: number
): ShoreGrid {
  const width = i1 - i0 + 1;
  const height = j1 - j0 + 1;
  const wet = new Uint8Array(Math.max(0, width * height));
  const own = new Uint8Array(Math.max(0, width * height));
  const half = span / 2;
  const cache = new Map<string, ResolvedWater | null>();
  for (let j = j0; j <= j1; j++) {
    const cy = Math.ceil((j - half) / span);
    for (let i = i0; i <= i1; i++) {
      const cx = Math.ceil((i - half) / span);
      const key = `${cx},${cy}`;
      let water = cache.get(key);
      if (water === undefined) {
        water = getWater(cx, cy);
        cache.set(key, water);
      }
      const g = (j - j0) * width + (i - i0);
      if (!water) {
        wet[g] = 1;
        continue;
      }
      const t = (cy * span + half - j) * water.size + (i - cx * span + half);
      if (water.coverage[t] === 0) continue;
      if (water.bodyIds[t] === bodyId) {
        own[g] = 1;
        continue;
      }
      const heights = getHeights(cx, cy);
      if (!heights || waterShowsAt(water, heights, t)) wet[g] = 1;
    }
  }
  return { i0, j0, width, height, wet, own };
}

// A plane of `grid` at world texel (i, j), or -1 outside it.
function gridAt(grid: ShoreGrid, plane: Uint8Array, i: number, j: number) {
  const x = i - grid.i0;
  const y = j - grid.j0;
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return -1;
  return plane[y * grid.width + x];
}

/**
 * Raises dry ground in the stroke's shore apron into a lip. The stroke's
 * `discs` are its stamps as (x, z, radius) triples in metres, each radius a
 * shoreline. Past the outline of their union the lip rises from `level` to
 * `level + height` over SHORE_RISE, steeply at first, holds its top to
 * SHORE_CREST, past every texel the stroke's coverage reaches, then eases to
 * `original`, the ground as it stood when the stroke began, by SHORE_REACH.
 * Ground is only raised, and never under water that was there when the stroke
 * began: another body's that shows, or its own body's where the ground then
 * lay below the level.
 */
export function applyWaterLip(
  source: SculptHeightSource,
  grid: ShoreGrid,
  discs: readonly number[],
  level: number,
  height: number,
  original: (cx: number, cy: number) => Float32Array | null
): TouchedChunk[] {
  const mps = source.metersPerSample ?? 1;
  const step = WATER_EDIT_STEP;
  const originals = chunkPlane(source.chunkSize, original);
  return editSamples(
    source,
    grid.i0 * step,
    grid.j0 * step,
    (grid.i0 + grid.width - 1) * step,
    (grid.j0 + grid.height - 1) * step,
    (wx, wz, v) => {
      const x = wx * mps;
      const z = wz * mps;
      // Distance out from the stroke's water.
      let out = Infinity;
      for (let k = 0; k + 2 < discs.length; k += 3) {
        const r = discs[k + 2];
        const dx = x - discs[k];
        const dz = z - discs[k + 1];
        if (Math.abs(dx) - r >= out || Math.abs(dz) - r >= out) continue;
        const edge = Math.hypot(dx, dz) - r;
        if (edge < out) out = edge;
      }
      if (out <= 0 || out >= SHORE_REACH) return v;
      const ti = Math.round(wx / step);
      const tj = Math.round(wz / step);
      if (gridAt(grid, grid.wet, ti, tj) !== 0) return v;
      const before = originals.at(wx, wz);
      const ground = before ? before[originals.index] : v;
      if (gridAt(grid, grid.own, ti, tj) === 1 && ground < level) return v;
      const lip = lipProfile(out, level, height, ground);
      return lip > v ? lip : v;
    }
  );
}

// A lip `out` metres from its shoreline: from `level` up to `level + height`
// over SHORE_RISE, steeply at first, held to SHORE_CREST, then easing to
// `ground` by SHORE_REACH.
function lipProfile(
  out: number,
  level: number,
  height: number,
  ground: number
): number {
  const top = level + height;
  if (out < SHORE_RISE) return level + height * easeOut(out, 0, SHORE_RISE);
  if (out < SHORE_CREST) return top;
  return top + (ground - top) * smoothstep(out, SHORE_CREST, SHORE_REACH);
}

// Metres (x, z) lies inside the union of `discs`, (x, z, radius) triples;
// negative outside.
function insideDiscs(discs: readonly number[], x: number, z: number): number {
  let inside = -Infinity;
  for (let k = 0; k + 2 < discs.length; k += 3) {
    const depth = discs[k + 2] - Math.hypot(x - discs[k], z - discs[k + 1]);
    if (depth > inside) inside = depth;
  }
  return inside;
}

/**
 * The water a remove stroke cuts, over world texels (i0, j0)–(i1, j1).
 * `level` is the surface of edited water that stays: water the generator does
 * not make there, outside the stroke's circles or joined to that within
 * WATER_COVER_MARGIN inside them; NaN elsewhere. `covered` is 1 where water
 * covers the texel once `released` is handed back. `released` holds the (i, j)
 * of the edited water inside the circles that does not stay.
 */
export interface CutGrid {
  i0: number;
  j0: number;
  width: number;
  height: number;
  level: Float32Array;
  covered: Uint8Array;
  released: number[];
}

/**
 * The cut grid for a remove stroke whose circles are `discs`. `getWater` gives
 * a chunk's water as it stands, `getGenerated` as the generator makes it;
 * `span` is a chunk's width in texels and `unit` a texel's width in metres.
 */
export function buildCutGrid(
  getWater: (cx: number, cy: number) => ResolvedWater | null,
  getGenerated: (cx: number, cy: number) => ResolvedWater | null,
  span: number,
  unit: number,
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  discs: readonly number[]
): CutGrid {
  const width = Math.max(0, i1 - i0 + 1);
  const height = Math.max(0, j1 - j0 + 1);
  const count = width * height;
  const level = new Float32Array(count).fill(NaN);
  const covered = new Uint8Array(count);
  const inside = new Float32Array(count);
  const standing = new Float32Array(count).fill(NaN);
  const generatedCovered = new Uint8Array(count);
  const half = span / 2;
  const waters = new Map<string, ResolvedWater | null>();
  const generated = new Map<string, ResolvedWater | null>();
  for (let j = j0; j <= j1; j++) {
    const cy = Math.ceil((j - half) / span);
    for (let i = i0; i <= i1; i++) {
      const cx = Math.ceil((i - half) / span);
      const g = (j - j0) * width + (i - i0);
      inside[g] = insideDiscs(discs, i * unit, j * unit);
      const key = `${cx},${cy}`;
      let water = waters.get(key);
      if (water === undefined) {
        water = getWater(cx, cy);
        waters.set(key, water);
      }
      let made = generated.get(key);
      if (made === undefined) {
        made = getGenerated(cx, cy);
        generated.set(key, made);
      }
      const t = (cy * span + half - j) * (span + 1) + (i - cx * span + half);
      const madeCovered = !!made && made.coverage[t] > 0;
      generatedCovered[g] = madeCovered ? 1 : 0;
      if (!water || water.coverage[t] === 0) continue;
      covered[g] = 1;
      const surface = water.levels[t];
      if (
        madeCovered &&
        Math.abs(made!.levels[t] - surface) <= WATER_LEVEL_MATCH
      )
        continue;
      standing[g] = surface;
    }
  }

  const stack: number[] = [];
  for (let g = 0; g < count; g++)
    if (!Number.isNaN(standing[g]) && inside[g] <= 0) {
      level[g] = standing[g];
      stack.push(g);
    }
  while (stack.length > 0) {
    const g = stack.pop()!;
    const x = g % width;
    const y = (g - x) / width;
    for (let n = 0; n < 4; n++) {
      const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
      const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ng = ny * width + nx;
      if (
        !Number.isNaN(level[ng]) ||
        Number.isNaN(standing[ng]) ||
        inside[ng] >= WATER_COVER_MARGIN
      )
        continue;
      level[ng] = standing[ng];
      stack.push(ng);
    }
  }

  const released: number[] = [];
  for (let g = 0; g < count; g++) {
    if (inside[g] <= 0 || Number.isNaN(standing[g]) || !Number.isNaN(level[g]))
      continue;
    const x = g % width;
    released.push(i0 + x, j0 + (g - x) / width);
    covered[g] = generatedCovered[g];
  }
  return { i0, j0, width, height, level, covered, released };
}

/**
 * Raises a bank inside a remove stroke's circles where they cut water that
 * stays (see buildCutGrid), so the circles' outline becomes its shore. Inward
 * from the outline the bank follows the add brush's lip: from the water's
 * level up to `level + height`, held, then easing to the ground as it stands.
 * It fades out along the outline from SHORE_CREST to SHORE_REACH away from
 * that water, and leaves ground under other water alone. Ground is only
 * raised.
 */
export function applyCutBank(
  source: SculptHeightSource,
  grid: CutGrid,
  discs: readonly number[],
  height: number
): TouchedChunk[] {
  const mps = source.metersPerSample ?? 1;
  const step = WATER_EDIT_STEP;
  const unit = step * mps;
  const window = Math.ceil(SHORE_REACH / unit);
  return editSamples(
    source,
    grid.i0 * step,
    grid.j0 * step,
    (grid.i0 + grid.width - 1) * step,
    (grid.j0 + grid.height - 1) * step,
    (wx, wz, v) => {
      const x = wx * mps;
      const z = wz * mps;
      const inside = insideDiscs(discs, x, z);
      if (inside <= 0 || inside >= SHORE_REACH) return v;
      const ti = Math.round(wx / step);
      const tj = Math.round(wz / step);
      const own = gridIndex(grid, ti, tj);
      if (own >= 0 && grid.covered[own] && Number.isNaN(grid.level[own]))
        return v;

      let nearest = Infinity;
      let level = NaN;
      for (let j = tj - window; j <= tj + window; j++)
        for (let i = ti - window; i <= ti + window; i++) {
          const g = gridIndex(grid, i, j);
          if (g < 0 || Number.isNaN(grid.level[g])) continue;
          const d = Math.hypot(i * unit - x, j * unit - z);
          if (d < nearest) {
            nearest = d;
            level = grid.level[g];
          }
        }
      if (nearest >= SHORE_REACH) return v;

      const bank = lipProfile(inside, level, height, v);
      const target =
        v + (bank - v) * (1 - smoothstep(nearest, SHORE_CREST, SHORE_REACH));
      return target > v ? target : v;
    }
  );
}

// The index of world texel (i, j) in `grid`, or -1 outside it.
function gridIndex(grid: CutGrid, i: number, j: number): number {
  const x = i - grid.i0;
  const y = j - grid.j0;
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return -1;
  return y * grid.width + x;
}
