import { Vector2 } from 'rewild-common';
import { TerrainHeights } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { ClimateConfig, validateLakes } from './Biomes';
import { carveLakes } from './Lakes';

// Terrain heights come from the Rust generator (packages/rewild-wasm/crates/
// terrain). The WASM module must be loaded first (see RewildWasm).

// One generator per world. Climates are keyed by identity: presets are shared
// objects, and an ad hoc climate is collected along with its generators.
const generators = new WeakMap<ClimateConfig, Map<string, TerrainHeights>>();

function heightsFor(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number
): TerrainHeights {
  let worlds = generators.get(climate);
  if (!worlds) {
    worlds = new Map();
    generators.set(climate, worlds);
  }
  const key = `${seed}:${seaLevel}`;
  let heights = worlds.get(key);
  if (!heights) {
    validateLakes(climate);
    heights = new TerrainHeights(
      climate,
      seed,
      seaLevel,
      TERRAIN_METERS_PER_SAMPLE
    );
    worlds.set(key, heights);
  }
  return heights;
}

/**
 * Reads the un-eroded, uncarved ground anywhere in the world by lake space
 * position (see Lakes.ts).
 */
export interface GroundSampler {
  heights: TerrainHeights;
  climate: ClimateConfig;
  seaLevel: number;
}

export function createGroundSampler(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number
): GroundSampler {
  return { heights: heightsFor(seed, climate, seaLevel), climate, seaLevel };
}

export function sampleGround(
  sampler: GroundSampler,
  u: number,
  v: number
): number {
  return sampler.heights.ground(u, v);
}

/** The continent field at lake space (u, v). See sampleContinent. */
export function sampleGroundContinent(
  sampler: GroundSampler,
  u: number,
  v: number
): number {
  return sampler.heights.continent(u, v);
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

  const heights = heightsFor(seed, climate, seaLevel).generate(
    width,
    height,
    offset.x,
    offset.y
  );
  carveLakes(heights, width, height, seed, offset, climate, seaLevel);
  return heights;
}
