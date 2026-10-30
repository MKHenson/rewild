import { Vector2 } from 'rewild-common';
import { TerrainGenerator } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { ClimateConfig } from './Biomes';
import { terrainGenerator } from './TerrainGenerator';

/**
 * Reads the un-eroded, uncarved ground anywhere in the world by lake space
 * position (see Lakes.ts).
 */
export interface GroundSampler {
  generator: TerrainGenerator;
  climate: ClimateConfig;
  seaLevel: number;
}

export function createGroundSampler(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number
): GroundSampler {
  return {
    generator: terrainGenerator(seed, climate, seaLevel),
    climate,
    seaLevel,
  };
}

export function sampleGround(
  sampler: GroundSampler,
  u: number,
  v: number
): number {
  return sampler.generator.ground(u, v);
}

/**
 * Generates a heightmap in absolute world meters, with the biome at each
 * sample selected by a temperature × moisture climate model, eroded, and with
 * lakes carved.
 *
 * Sample (x, y) sits at lake space (x - width / 2 + offset.x,
 * y - height / 2 - offset.y), so neighbouring fields agree exactly where they
 * meet.
 */
export function generateBiomeBlendedHeightMap(
  width: number,
  height: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number = 0
): Float32Array {
  if (width <= 0 || height <= 0)
    throw new Error('Width and height must be positive integers.');

  return terrainGenerator(seed, climate, seaLevel).heights(
    width,
    height,
    offset.x,
    offset.y
  );
}
