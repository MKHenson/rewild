import {
  carveStamp,
  cutBank,
  waterLip,
} from '../../../../rewild-wasm/pkg/rewild_wasm';
import { HeightPatch } from './HeightPatch';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { SculptHeightSource, TouchedChunk } from './Sculpt';
import { WATER_EDIT_STEP, WATER_LEVEL_MATCH, WaterGuard } from './WaterEdit';
import { ResolvedWater, waterShowsAt } from './WaterMap';

// The terrain under the water brush. Adding water fills the brush's circle:
// it digs a bed under it, and a shore apron outside the circle holds the
// coverage past the shoreline and a lip that holds the water, so the ground,
// not the water map's texels, makes the shore. Removing water hands the circle
// back to the generator, and where it cuts water that stays, a bank just
// inside the circle becomes that water's shore.

// Metres a water map texel spans. The shore distances below are mirrored by
// `terrain::edit::Shore`.
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
  const { radius } = stamp;
  const blend = Math.min(1, stamp.amount);
  if (radius <= 0 || blend <= 0) return [];

  const mps = source.metersPerSample ?? 1;
  const centerX = stamp.centerX / mps;
  const centerZ = stamp.centerZ / mps;
  const outer = (radius + SHORE_REACH) / mps;
  const patch = new HeightPatch(
    source,
    Math.ceil(centerX - outer),
    Math.ceil(centerZ - outer),
    Math.floor(centerX + outer),
    Math.floor(centerZ + outer)
  );
  const targets = patch.plane(stamp.targets);
  const { guard } = stamp;
  const changed = carveStamp(
    ...patch.args(),
    patch.plane(stamp.original),
    targets,
    guard.blocked,
    guard.i0,
    guard.j0,
    guard.width,
    WATER_EDIT_STEP,
    TEXEL,
    stamp.centerX,
    stamp.centerZ,
    radius,
    stamp.level,
    stamp.depth,
    blend
  );
  patch.writePlane(targets, stamp.targets);
  return patch.commit(changed);
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
  const patch = gridPatch(source, grid);
  return patch.commit(
    waterLip(
      ...patch.args(),
      patch.plane(original),
      new Float64Array(discs),
      grid.wet,
      grid.own,
      grid.i0,
      grid.j0,
      grid.width,
      WATER_EDIT_STEP,
      TEXEL,
      level,
      height
    )
  );
}

// The LOD-0 samples under a texel grid.
function gridPatch(
  source: SculptHeightSource,
  grid: { i0: number; j0: number; width: number; height: number }
): HeightPatch {
  const step = WATER_EDIT_STEP;
  return new HeightPatch(
    source,
    grid.i0 * step,
    grid.j0 * step,
    (grid.i0 + grid.width - 1) * step,
    (grid.j0 + grid.height - 1) * step
  );
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
  const patch = gridPatch(source, grid);
  return patch.commit(
    cutBank(
      ...patch.args(),
      new Float64Array(discs),
      grid.level,
      grid.covered,
      grid.i0,
      grid.j0,
      grid.width,
      WATER_EDIT_STEP,
      TEXEL,
      height
    )
  );
}
