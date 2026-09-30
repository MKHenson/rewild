import { SculptHeightSource, TouchedChunk, editSamples } from './Sculpt';
import {
  WATER_EDIT_STEP,
  WaterGuard,
  isWaterBlocked,
} from './WaterEdit';
import type { ResolvedWater } from './WaterMap';

// The terrain under the water brush. Adding water digs a bed below its level
// with each stamp, and the stroke's end raises a lip around it, so the water
// sits in ground that holds it. Removing water raises the ground under it
// above its level, so land takes its place.

/** Metres the carved bank rises per metre past the brush. */
export const CARVE_BANK_SLOPE = 1;
/** How far past the brush, as a share of its radius, the bank cuts. */
export const CARVE_BANK_REACH = 1;
/** Metres the lip's flat top reaches past the water. */
export const WATER_LIP_WIDTH = 8;
/** Metres over which the lip eases back to the ground. */
export const WATER_LIP_EASE = 16;

export interface CarveStamp {
  centerX: number;
  centerZ: number;
  /** Brush radius in metres. */
  radius: number;
  /** World height of the water's surface. */
  level: number;
  /** Metres the bed lies below the level at the brush centre. */
  depth: number;
  /** Blend fraction (0..1) toward the bed. */
  amount: number;
  guard: WaterGuard;
}

// 1 at the centre, 0 at the radius: the paint and sculpt brushes' curve.
function falloff(dist: number, radius: number): number {
  const t = dist / radius;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Lowers the ground toward a bed under the brush: `depth` below the level at
 * the centre, rising to the level at the radius, then a bank climbing at
 * CARVE_BANK_SLOPE for CARVE_BANK_REACH of the radius beyond it. Ground is
 * only lowered, and never where the guard blocks its texel.
 */
export function applyCarveStamp(
  source: SculptHeightSource,
  stamp: CarveStamp
): TouchedChunk[] {
  const { level, depth, guard } = stamp;
  const radius = stamp.radius;
  const blend = Math.min(1, stamp.amount);
  if (radius <= 0 || blend <= 0) return [];

  const mps = source.metersPerSample ?? 1;
  const reach = radius * (1 + CARVE_BANK_REACH);
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
      if (d > reach) return v;
      const bed =
        d < radius
          ? level - depth * falloff(d, radius)
          : level + (d - radius) * CARVE_BANK_SLOPE;
      if (bed >= v) return v;
      if (
        isWaterBlocked(
          guard,
          Math.round(wx / WATER_EDIT_STEP),
          Math.round(wz / WATER_EDIT_STEP)
        )
      )
        return v;
      return v + (bed - v) * blend;
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
  /** Blend fraction (0..1) toward the raised ground. */
  amount: number;
  /** The water under the brush when the stroke reached it. */
  levels: WaterLevels;
}

/**
 * Raises the ground under water toward land: `rise` above the water's level
 * at the brush centre, falling to the level at the radius, so the shore
 * follows the brush. Ground is only raised, and only where water covered its
 * texel.
 */
export function applyRaiseStamp(
  source: SculptHeightSource,
  stamp: RaiseStamp
): TouchedChunk[] {
  const { radius, rise, levels } = stamp;
  const blend = Math.min(1, stamp.amount);
  if (radius <= 0 || blend <= 0) return [];

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
      return land > v ? v + (land - v) * blend : v;
    }
  );
}

const SHORE_DRY = 0;
const SHORE_SOURCE = 1;
const SHORE_WET = 2;

/**
 * World texels around a stroke's water: SHORE_SOURCE where the stroke's body
 * covers a texel inside one of its discs, SHORE_WET where other water covers
 * it or it is not known, else SHORE_DRY.
 */
export interface ShoreGrid {
  i0: number;
  j0: number;
  width: number;
  height: number;
  state: Uint8Array;
}

/**
 * The shore grid over world texels (i0, j0)–(i1, j1). `discs` holds the
 * stroke's stamps as (x, z, radius) triples in metres; `unit` is a texel's
 * width in metres and `span` a chunk's width in texels.
 */
export function buildShoreGrid(
  getWater: (cx: number, cy: number) => ResolvedWater | null,
  span: number,
  unit: number,
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  bodyId: number,
  discs: readonly number[]
): ShoreGrid {
  const width = i1 - i0 + 1;
  const height = j1 - j0 + 1;
  const state = new Uint8Array(Math.max(0, width * height));
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
        state[g] = SHORE_WET;
        continue;
      }
      const t = (cy * span + half - j) * water.size + (i - cx * span + half);
      if (water.coverage[t] === 0) continue;
      state[g] =
        water.bodyIds[t] === bodyId && inDiscs(discs, i * unit, j * unit)
          ? SHORE_SOURCE
          : SHORE_WET;
    }
  }
  return { i0, j0, width, height, state };
}

function inDiscs(discs: readonly number[], x: number, z: number): boolean {
  for (let d = 0; d + 2 < discs.length; d += 3) {
    const dx = x - discs[d];
    const dz = z - discs[d + 1];
    if (dx * dx + dz * dz <= discs[d + 2] * discs[d + 2]) return true;
  }
  return false;
}

function shoreState(grid: ShoreGrid, i: number, j: number): number {
  const x = i - grid.i0;
  const y = j - grid.j0;
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return SHORE_WET;
  return grid.state[y * grid.width + x];
}

/**
 * Raises dry ground near the stroke's water to `top`: flat for
 * WATER_LIP_WIDTH past the water, easing back to the ground over
 * WATER_LIP_EASE. Ground is only raised, and never under water.
 */
export function applyWaterLip(
  source: SculptHeightSource,
  grid: ShoreGrid,
  top: number
): TouchedChunk[] {
  const mps = source.metersPerSample ?? 1;
  const step = WATER_EDIT_STEP;
  const unit = mps * step;
  const reach = WATER_LIP_WIDTH + WATER_LIP_EASE;
  const texels = Math.ceil(reach / unit) + 1;
  return editSamples(
    source,
    grid.i0 * step,
    grid.j0 * step,
    (grid.i0 + grid.width - 1) * step,
    (grid.j0 + grid.height - 1) * step,
    (wx, wz, v) => {
      if (v >= top) return v;
      const ti = Math.round(wx / step);
      const tj = Math.round(wz / step);
      if (shoreState(grid, ti, tj) !== SHORE_DRY) return v;
      let nearest = Infinity;
      for (let j = tj - texels; j <= tj + texels; j++)
        for (let i = ti - texels; i <= ti + texels; i++) {
          if (shoreState(grid, i, j) !== SHORE_SOURCE) continue;
          const d = Math.hypot(wx * mps - i * unit, wz * mps - j * unit);
          if (d < nearest) nearest = d;
        }
      const d = Math.max(0, nearest - unit / 2);
      if (d >= reach) return v;
      let t = d <= WATER_LIP_WIDTH ? 0 : (d - WATER_LIP_WIDTH) / WATER_LIP_EASE;
      t = t * t * (3 - 2 * t);
      const lip = top + (v - top) * t;
      return lip > v ? lip : v;
    }
  );
}
