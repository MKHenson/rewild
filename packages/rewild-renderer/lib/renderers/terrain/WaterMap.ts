import { Vector2 } from 'rewild-common';
import { ClimateConfig, ContinentConfig } from './Biomes';
import { createClimateField, sampleContinent } from './ClimateField';
import { BIOME_MASK_STEP, paintMaskSize } from './PaintMask';
import { MAX_WATER_TYPES, OCEAN_WATER, getWaterTypeIndex } from './Water';
import { toFloat16 } from '../../utils/float16';

// Where a chunk's water is, how high, and what kind.
//
// Texels sit on LOD-0 samples every WATER_MAP_STEP samples, like a paint mask,
// so neighbouring chunks share their edge texels. Heights and levels are f16
// relative to the chunk's base level, which keeps them precise near the
// waterline at any world height.

export const WATER_MAP_STEP = BIOME_MASK_STEP;

export interface WaterMap {
  size: number;
  step: number;
  /** Lowest water level in the chunk. `level` and `heights` are relative to it. */
  baseLevel: number;
  /** Highest water level in the chunk. */
  maxLevel: number;
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
}

export const OCEAN_BODY_ID = 0;

/**
 * How much ocean may stand at continent value `c`: all of it out to where the
 * land is at full height, then fading over one more blend width inland. Land
 * past that stays dry even below sea level.
 */
export function oceanCoverage(continent: ContinentConfig, c: number): number {
  const half = continent.blendHalfWidth;
  const t = (c - (continent.coast + half)) / half;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The water map for a chunk with LOD-0 `heights`, or null when no water shows
 * anywhere in it. `offset` is the chunk's sample-space offset, as for the
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
  const continent = climate.continent;
  if (!continent) return null;

  const oceanType = getWaterTypeIndex(climate, OCEAN_WATER);
  if (oceanType < 0 || oceanType >= MAX_WATER_TYPES) return null;

  const step = WATER_MAP_STEP;
  const size = paintMaskSize(chunkSize, step);
  const texels = size * size;
  const field = createClimateField(chunkSize, chunkSize, seed, offset, climate);

  const coverage = new Uint8Array(texels);
  let covered = false;
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const c = sampleContinent(field, mx * step, my * step);
      const value = Math.round(oceanCoverage(continent, c) * 255);
      coverage[mx + my * size] = value;
      if (value > 0) covered = true;
    }
  }
  if (!covered) return null;

  // Water shows where a covered texel's footprint dips below the level. The
  // footprint reaches half a step either side, so no full-resolution hollow is
  // missed between texels.
  const reach = step >> 1;
  let wet = false;
  for (let my = 0; my < size && !wet; my++) {
    for (let mx = 0; mx < size && !wet; mx++) {
      if (coverage[mx + my * size] === 0) continue;
      const x0 = Math.max(0, mx * step - reach);
      const x1 = Math.min(chunkSize - 1, mx * step + reach);
      const y0 = Math.max(0, my * step - reach);
      const y1 = Math.min(chunkSize - 1, my * step + reach);
      for (let y = y0; y <= y1 && !wet; y++)
        for (let x = x0; x <= x1; x++)
          if (heights[x + y * chunkSize] < seaLevel) {
            wet = true;
            break;
          }
    }
  }
  if (!wet) return null;

  // Only the ocean exists so far, so every texel sits at sea level.
  const baseLevel = seaLevel;
  const maxLevel = seaLevel;

  const level = new Uint16Array(texels).fill(toFloat16(0));
  const relHeights = new Uint16Array(texels);
  const typeWeights = new Uint8Array(texels * 4);
  const bodyIds = new Uint32Array(texels).fill(OCEAN_BODY_ID);
  const flow = new Int8Array(texels * 2);

  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const t = mx + my * size;
      relHeights[t] = toFloat16(
        heights[mx * step + my * step * chunkSize] - baseLevel
      );
      if (coverage[t] > 0) typeWeights[t * 4 + oceanType] = 255;
    }
  }

  return {
    size,
    step,
    baseLevel,
    maxLevel,
    level,
    heights: relHeights,
    coverage,
    typeWeights,
    bodyIds,
    flow,
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
