import { Vector2 } from 'rewild-common';
import { ClimateConfig } from './Biomes';
import {
  Lake,
  OCEAN_BODY_ID,
  WaterBody,
  lakeBody,
  oceanBody,
  waterEditData,
} from './Lakes';
import { BIOME_MASK_STEP, paintMaskSize } from './PaintMask';
import { terrainGenerator } from './TerrainGenerator';
import { WaterEdit, editedBody } from './WaterEdit';
import { toFloat16 } from '../../utils/float16';

// Where a chunk's water is, how high, and what kind. Generated in Rust
// (crates/terrain/src/water.rs), which also blends the chunk's edit.
//
// Texels sit on LOD-0 samples every WATER_MAP_STEP samples, like a paint mask,
// so neighbouring chunks share their edge texels. Heights and levels are f16
// relative to the chunk's base level, which keeps them precise near the
// waterline at any world height.

export const WATER_MAP_STEP = BIOME_MASK_STEP;

/** Metres above a covered level the swash can run up: water shows over ground
 *  below it. Mirrors SWASH_REACH in water.rs. */
export const SWASH_REACH = 1.5;
/** Metres above a covered level within which a chunk keeps its water map for
 *  the terrain's wet band, though no water shows. */
export const WET_BAND_REACH = 2;

export interface WaterMap {
  size: number;
  step: number;
  /** Lowest water level in the chunk. `level` and `heights` are relative to it. */
  baseLevel: number;
  /** Highest water level in the chunk. */
  maxLevel: number;
  /** Whether water shows anywhere in the chunk. False keeps the map for the
   *  terrain's wet band alone. */
  shows: boolean;
  /** f16 bits: water surface height − baseLevel. */
  level: Uint16Array;
  /** f16 bits: terrain height − baseLevel. */
  heights: Uint16Array;
  /** 0..255: how much water the texel holds. Zero is dry at any height. */
  coverage: Uint8Array;
  /** RGBA8 weights over the climate's water palette. */
  typeWeights: Uint8Array;
  /** The water body that owns the texel. 0 is the ocean. */
  bodyIds: Uint32Array;
  /** RG8 snorm flow direction. Zero is still water. */
  flow: Int8Array;
  /** The record of every body that covers a texel here. */
  bodies: WaterBody[];
}

export { OCEAN_BODY_ID };

/** A chunk's water before the terrain is consulted: the generator blended with
 *  the chunk's edit, per water map texel. */
export interface ResolvedWater {
  size: number;
  step: number;
  /** 0..255. */
  coverage: Uint8Array;
  /** World height of the surface. */
  levels: Float64Array;
  /** RGBA8 palette weights, written where coverage > 0. */
  typeWeights: Uint8Array;
  bodyIds: Uint32Array;
  /** The generated lakes that reach the chunk. */
  lakes: Lake[];
  covered: boolean;
}

/**
 * The generated water of a chunk at sample-space `offset`, with `edit` blended
 * over it. Needs no heights, so it resolves for chunks that are not loaded.
 */
export function resolveWater(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number,
  edit: WaterEdit | null = null
): ResolvedWater {
  const step = WATER_MAP_STEP;
  const size = paintMaskSize(chunkSize, step);
  const built = terrainGenerator(seed, climate, seaLevel).water(
    chunkSize,
    step,
    offset.x,
    offset.y,
    waterEditData(edit)
  );
  const resolved: ResolvedWater = {
    size,
    step,
    coverage: built.takeCoverage(),
    levels: built.takeLevels(),
    typeWeights: built.takeTypeWeights(),
    bodyIds: built.takeBodyIds(),
    lakes: built.lakes(),
    covered: built.covered,
  };
  built.free();
  return resolved;
}

/**
 * Whether the water at texel `t` shows over the chunk's LOD-0 `heights`: its
 * footprint dips below the level plus the swash, as in buildWaterMap. Coverage
 * alone only says where water may stand. The ocean covers land inland of the
 * coast that stands above it. True when the heights do not fit the chunk.
 */
export function waterShowsAt(
  water: ResolvedWater,
  heights: Float32Array,
  t: number
): boolean {
  const { size, step } = water;
  const chunkSize = (size - 1) * step + 1;
  if (heights.length !== chunkSize * chunkSize) return true;
  const mx = t % size;
  const my = (t - mx) / size;
  const reach = step >> 1;
  const top = water.levels[t] + SWASH_REACH;
  const x0 = Math.max(0, mx * step - reach);
  const x1 = Math.min(chunkSize - 1, mx * step + reach);
  const y0 = Math.max(0, my * step - reach);
  const y1 = Math.min(chunkSize - 1, my * step + reach);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (heights[x + y * chunkSize] < top) return true;
  return false;
}

/**
 * The water map for a chunk with LOD-0 `heights`, or null when the ground
 * everywhere stands WET_BAND_REACH or more above the covered levels. `offset`
 * is the chunk's sample-space offset, as for the height and splat generators.
 * `edit` is the chunk's authored water, blended over the generated.
 */
export function buildWaterMap(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number,
  heights: Float32Array,
  edit: WaterEdit | null = null
): WaterMap | null {
  const step = WATER_MAP_STEP;
  const size = paintMaskSize(chunkSize, step);
  const built = terrainGenerator(seed, climate, seaLevel).waterMap(
    chunkSize,
    step,
    offset.x,
    offset.y,
    heights,
    waterEditData(edit)
  );
  if (!built) return null;

  const typeWeights = built.takeTypeWeights();
  const bodyIds = built.takeBodyIds();
  const lakes: Lake[] = built.lakes();
  const bodyTexels = built.bodyTexels();
  const bodyLevels = built.bodyLevels();
  const bodies: WaterBody[] = [];
  for (let i = 0; i < bodyTexels.length; i++) {
    const t = bodyTexels[i];
    const id = bodyIds[t];
    const lake = lakes.find((l) => l.bodyId === id);
    if (lake) bodies.push(lakeBody(lake, climate));
    else if (id === OCEAN_BODY_ID) bodies.push(oceanBody(climate, seaLevel));
    else
      bodies.push(
        editedBody(id, bodyLevels[i], typeWeights.subarray(t * 4, t * 4 + 4))
      );
  }

  const water: WaterMap = {
    size,
    step,
    baseLevel: built.baseLevel,
    maxLevel: built.maxLevel,
    shows: built.shows,
    level: built.takeLevel(),
    heights: built.takeHeights(),
    coverage: built.takeCoverage(),
    typeWeights,
    bodyIds,
    flow: new Int8Array(size * size * 2),
    bodies,
  };
  built.free();
  return water;
}

/** The buffers a worker transfers rather than copies. */
export function waterMapTransferables(water: WaterMap | null): ArrayBuffer[] {
  if (!water) return [];
  return [
    water.level.buffer,
    water.heights.buffer,
    water.coverage.buffer,
    water.typeWeights.buffer,
    water.bodyIds.buffer,
    water.flow.buffer,
  ] as ArrayBuffer[];
}

/**
 * Interleaves `water` into one rgba16float texel per map texel: (level,
 * terrain height, coverage, 0). Writes into `out` when it is the right size.
 */
export function packWaterSurface(
  water: WaterMap,
  out?: Uint16Array
): Uint16Array {
  const texels = water.size * water.size;
  const packed =
    out && out.length === texels * 4 ? out : new Uint16Array(texels * 4);
  const zero = toFloat16(0);
  for (let t = 0; t < texels; t++) {
    packed[t * 4] = water.level[t];
    packed[t * 4 + 1] = water.heights[t];
    packed[t * 4 + 2] = toFloat16(water.coverage[t] / 255);
    packed[t * 4 + 3] = zero;
  }
  return packed;
}
