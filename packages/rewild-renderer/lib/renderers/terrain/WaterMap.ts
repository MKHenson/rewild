import { Vector2 } from 'rewild-common';
import { ClimateConfig } from './Biomes';
import { createClimateField } from './ClimateField';
import {
  OCEAN_BODY_ID,
  WaterBody,
  createWaterSampler,
  lakeBody,
  oceanBody,
  sampleWater,
} from './Lakes';
import { BIOME_MASK_STEP, paintMaskSize } from './PaintMask';
import { MAX_WATER_TYPES } from './Water';
import { toFloat16 } from '../../utils/float16';

// Where a chunk's water is, how high, and what kind.
//
// Texels sit on LOD-0 samples every WATER_MAP_STEP samples, like a paint mask,
// so neighbouring chunks share their edge texels. Heights and levels are f16
// relative to the chunk's base level, which keeps them precise near the
// waterline at any world height.

export const WATER_MAP_STEP = BIOME_MASK_STEP;

/** Metres above a covered level the swash can run up: water shows over ground
 *  below it. */
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

/**
 * The water map for a chunk with LOD-0 `heights`, or null when the ground
 * everywhere stands WET_BAND_REACH or more above the covered levels. `offset` is the chunk's sample-space offset, as for the
 * height and splat generators.
 */
export function buildWaterMap(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number,
  heights: Float32Array
): WaterMap | null {
  if (!climate.continent && !climate.lakes) return null;

  const step = WATER_MAP_STEP;
  const size = paintMaskSize(chunkSize, step);
  const texels = size * size;
  const field = createClimateField(chunkSize, chunkSize, seed, offset, climate);
  const sampler = createWaterSampler(field, seed, offset, seaLevel);

  const coverage = new Uint8Array(texels);
  const levels = new Float64Array(texels);
  const typeWeights = new Uint8Array(texels * 4);
  const bodyIds = new Uint32Array(texels);
  const types = new Float64Array(MAX_WATER_TYPES);
  let covered = false;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const t = mx + my * size;
      const value = Math.round(
        sampleWater(sampler, mx * step, my * step, types) * 255
      );
      coverage[t] = value;
      levels[t] = sampler.level;
      bodyIds[t] = sampler.bodyId;
      if (value > 0) {
        covered = true;
        for (let c = 0; c < MAX_WATER_TYPES; c++)
          typeWeights[t * 4 + c] = Math.round(types[c] * 255);
      }
    }
  }
  if (!covered) return null;

  // Water shows where a covered texel's footprint dips below its level, or
  // where the swash can run over it. The footprint reaches half a step either
  // side, so no full-resolution hollow is missed between texels.
  const reach = step >> 1;
  let shows = false;
  let near = false;
  let baseLevel = Infinity;
  let maxLevel = -Infinity;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const t = mx + my * size;
      if (coverage[t] === 0) continue;
      const level = levels[t];
      if (level < baseLevel) baseLevel = level;
      if (level > maxLevel) maxLevel = level;
      if (shows) continue;
      const x0 = Math.max(0, mx * step - reach);
      const x1 = Math.min(chunkSize - 1, mx * step + reach);
      const y0 = Math.max(0, my * step - reach);
      const y1 = Math.min(chunkSize - 1, my * step + reach);
      for (let y = y0; y <= y1 && !shows; y++)
        for (let x = x0; x <= x1; x++) {
          const height = heights[x + y * chunkSize];
          if (height < level + WET_BAND_REACH) near = true;
          if (height < level + SWASH_REACH) {
            shows = true;
            break;
          }
        }
    }
  }
  if (!near) return null;

  const level = new Uint16Array(texels);
  const relHeights = new Uint16Array(texels);
  const flow = new Int8Array(texels * 2);

  const bodies: WaterBody[] = [];
  const seen = new Set<number>();
  for (let t = 0; t < texels; t++) {
    const id = bodyIds[t];
    if (coverage[t] === 0 || seen.has(id)) continue;
    seen.add(id);
    const lake = sampler.lakes.find((l) => l.bodyId === id);
    if (lake) bodies.push(lakeBody(lake, climate));
    else if (id === OCEAN_BODY_ID) bodies.push(oceanBody(climate, seaLevel));
  }

  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const t = mx + my * size;
      level[t] = toFloat16(levels[t] - baseLevel);
      relHeights[t] = toFloat16(
        heights[mx * step + my * step * chunkSize] - baseLevel
      );
    }
  }

  return {
    size,
    step,
    baseLevel,
    maxLevel,
    shows,
    level,
    heights: relHeights,
    coverage,
    typeWeights,
    bodyIds,
    flow,
    bodies,
  };
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
