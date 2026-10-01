import { easeOut, smoothstep } from 'rewild-common';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { SculptHeightSource, TouchedChunk, editSamples } from './Sculpt';
import { WATER_EDIT_STEP, WaterGuard, isWaterBlocked } from './WaterEdit';
import { ResolvedWater, waterShowsAt } from './WaterMap';

// The terrain under the water brush. Adding water fills the brush's circle:
// it digs a bed under it, and a shore apron outside the circle holds the
// coverage past the shoreline and a lip that holds the water, so the ground,
// not the water map's texels, makes the shore. Removing water raises the
// ground under it above its level, so land takes its place.

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

// 1 at the centre, 0 at the radius: the paint and sculpt brushes' curve.
function falloff(dist: number, radius: number): number {
  const t = dist / radius;
  return 1 - t * t * (3 - 2 * t);
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
 * The level of the water covering each world texel over
 * i0..i0+width-1, j0..j0+height-1, NaN where it is dry or not known.
 */
export interface WaterLevels {
  i0: number;
  j0: number;
  width: number;
  height: number;
  levels: Float32Array;
}

/** The water levels over world texels (i0, j0)–(i1, j1); see buildWaterGuard. */
export function buildWaterLevels(
  getWater: (cx: number, cy: number) => ResolvedWater | null,
  span: number,
  i0: number,
  j0: number,
  i1: number,
  j1: number
): WaterLevels {
  const width = i1 - i0 + 1;
  const height = j1 - j0 + 1;
  const levels = new Float32Array(Math.max(0, width * height)).fill(NaN);
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
      if (!water) continue;
      const t = (cy * span + half - j) * water.size + (i - cx * span + half);
      if (water.coverage[t] > 0)
        levels[(j - j0) * width + (i - i0)] = water.levels[t];
    }
  }
  return { i0, j0, width, height, levels };
}

export interface RaiseStamp {
  centerX: number;
  centerZ: number;
  /** Brush radius in metres. */
  radius: number;
  /** Metres above the water the ground rises to at the brush centre. */
  rise: number;
  /** The water under the brush when the stroke reached it. */
  levels: WaterLevels;
}

/**
 * Raises the ground under water toward land: `rise` above the water's level
 * at the brush centre, falling to the level at the radius, so the shore
 * follows the brush. Ground is lifted straight up to that shape, so
 * overlapping stamps leave one surface. It is only raised, and only where
 * water covered its texel.
 */
export function applyRaiseStamp(
  source: SculptHeightSource,
  stamp: RaiseStamp
): TouchedChunk[] {
  const { radius, rise, levels } = stamp;
  if (radius <= 0) return [];

  const mps = source.metersPerSample ?? 1;
  const centerX = stamp.centerX / mps;
  const centerZ = stamp.centerZ / mps;
  const outer = radius / mps;
  return editSamples(
    source,
    Math.ceil(centerX - outer),
    Math.ceil(centerZ - outer),
    Math.floor(centerX + outer),
    Math.floor(centerZ + outer),
    (wx, wz, v) => {
      const d = Math.hypot(wx - centerX, wz - centerZ) * mps;
      if (d > radius) return v;
      const x = Math.round(wx / WATER_EDIT_STEP) - levels.i0;
      const y = Math.round(wz / WATER_EDIT_STEP) - levels.j0;
      if (x < 0 || y < 0 || x >= levels.width || y >= levels.height) return v;
      const level = levels.levels[y * levels.width + x];
      if (Number.isNaN(level)) return v;
      const land = level + rise * falloff(d, radius);
      return land > v ? land : v;
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
  const top = level + height;
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
      const lip =
        out < SHORE_RISE
          ? level + height * easeOut(out, 0, SHORE_RISE)
          : out < SHORE_CREST
          ? top
          : top +
            (ground - top) *
              smoothstep(out, SHORE_CREST, SHORE_REACH);
      return lip > v ? lip : v;
    }
  );
}
