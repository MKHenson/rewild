import { Vector2 } from 'rewild-common';
import {
  WaterSampler as WasmWaterSampler,
  WaterEditData,
} from '../../../../rewild-wasm/pkg/rewild_wasm';
import { ClimateConfig } from './Biomes';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { terrainGenerator } from './TerrainGenerator';
import {
  LAKE_WATER,
  MAX_WATER_TYPES,
  OCEAN_WATER,
  getWaterTypeIndex,
} from './Water';
import type { WaterEdit } from './WaterEdit';

// Seeded lakes, generated in Rust (crates/terrain/src/lakes.rs): at most one
// per cell of a coarse grid, rebuilt by any chunk they reach from the seed.
//
// Positions are in lake space: the world's sample coordinates as the height
// noise reads them. A field of width W and height H at chunk offset o puts its
// sample (x, y) at (x - W/2 + o.x, y - H/2 - o.y).

export const OCEAN_BODY_ID = 0;

export interface Lake {
  cellX: number;
  cellY: number;
  /** Has the top bit set, so it is never the ocean's or an edited body's. */
  bodyId: number;
  /** Centre, in lake space. */
  u: number;
  v: number;
  /** A small lake settled in a cirque, where a lake was too steep. */
  tarn: boolean;
  /** A lake open to the sea: at sea level, with no lip on its seaward side. */
  lagoon: boolean;
  /** Bearing of a lagoon's mouth in lake space, in radians; NaN for a lake. */
  mouth: number;
  /** Mean shore radius, in samples. */
  radius: number;
  /** Bank reach as a multiple of the shore radius. */
  bank: number;
  /** Where the lip eases back to the ground, as a multiple of the shore radius. */
  outer: number;
  /** Furthest the lake shapes the ground from its centre, in samples. */
  reach: number;
  /** Metres from the level to the bed at the centre. */
  depth: number;
  /** World height of the surface. */
  level: number;
  /** The least height the bank's top is raised to, so the water stays in. */
  lip: number;
  /** The lowest point of the rim: the highest the level can rise. */
  spillHeight: number;
  irregularity: number;
}

/**
 * What the edit rules know about one body of water. A generated body is
 * rebuilt from the seed, so it costs nothing to save until it is edited.
 */
export interface WaterBody {
  /** OCEAN_BODY_ID, or the lake's bodyId. */
  id: number;
  /** World height of the surface. */
  level: number;
  /** The lowest point of the rim: the level cannot rise above it. */
  spillHeight: number;
  /** Palette weights for new water in this body, MAX_WATER_TYPES long. */
  typeWeights: number[];
}

function bodyWeights(
  climate: ClimateConfig,
  name: typeof OCEAN_WATER | typeof LAKE_WATER
): number[] {
  const weights = new Array<number>(MAX_WATER_TYPES).fill(0);
  const index = getWaterTypeIndex(climate, name);
  if (index >= 0 && index < MAX_WATER_TYPES) weights[index] = 1;
  return weights;
}

export function oceanBody(climate: ClimateConfig, seaLevel: number): WaterBody {
  return {
    id: OCEAN_BODY_ID,
    level: seaLevel,
    spillHeight: seaLevel,
    typeWeights: bodyWeights(climate, OCEAN_WATER),
  };
}

/** A generated lake's record. A lagoon's new water starts as lake water too. */
export function lakeBody(lake: Lake, climate: ClimateConfig): WaterBody {
  return {
    id: lake.bodyId,
    level: lake.level,
    spillHeight: lake.spillHeight,
    typeWeights: bodyWeights(climate, LAKE_WATER),
  };
}

/**
 * Every lake whose bank reaches the lake-space box [u0, u1] × [v0, v1].
 */
export function findLakes(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number
): Lake[] {
  if (!climate.lakes) return [];
  return terrainGenerator(seed, climate, seaLevel).lakes(u0, v0, u1, v1);
}

/** What became of one lake cell's roll, for debugging. */
export interface LakeCellReport {
  cellX: number;
  cellY: number;
  outcome:
    | 'no roll'
    | 'crowded'
    | 'ocean'
    | 'too steep'
    | 'too steep for a tarn'
    | 'too steep for a lagoon'
    | 'missed the sea'
    | 'lake'
    | 'tarn'
    | 'lagoon';
  /** The candidate's centre in lake space; NaN with no roll. */
  u: number;
  v: number;
  /** Degrees, at lake and then tarn size; NaN where not sampled. */
  rimSlope: number;
  tarnSlope: number;
  lake: Lake | null;
}

/**
 * What every lake cell overlapping the lake-space box did: rolled nothing,
 * lost to a neighbour, or settled or failed and why. Slow; for debugging.
 */
export function inspectLakeCells(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number
): LakeCellReport[] {
  if (!climate.lakes) return [];
  return terrainGenerator(seed, climate, seaLevel).inspectLakes(u0, v0, u1, v1);
}

/** Lake space from world metres, written into `out` as [u, v]. */
export function worldToLakeSpace(
  x: number,
  z: number,
  out: Float64Array
): void {
  out[0] = x / TERRAIN_METERS_PER_SAMPLE - 0.5;
  out[1] = -z / TERRAIN_METERS_PER_SAMPLE - 0.5;
}

/** World metres from lake space, written into `out` as [x, z]. */
export function lakeSpaceToWorld(
  u: number,
  v: number,
  out: Float64Array
): void {
  out[0] = (u + 0.5) * TERRAIN_METERS_PER_SAMPLE;
  out[1] = -(v + 0.5) * TERRAIN_METERS_PER_SAMPLE;
}

/** `edit` copied for one Rust call, which takes ownership of it. */
export function waterEditData(
  edit: WaterEdit | null
): WaterEditData | undefined {
  if (!edit) return undefined;
  const { mask } = edit;
  return new WaterEditData(
    mask.weights,
    mask.size,
    mask.step,
    edit.level,
    edit.bodyIds
  );
}

/**
 * The water of one chunk at any point in it: the ocean from the continent, the
 * lakes that reach it, and its edit over both. sampleWater writes its answer
 * into the fields below. Free it when done.
 */
export interface WaterSampler {
  wasm: WasmWaterSampler;
  /** Surface height at the last sample. */
  level: number;
  /** The ocean's coverage at the last sample. */
  ocean: number;
  /** The body that owns the last sample. */
  bodyId: number;
}

/** A water sampler over a `chunkSize` chunk at chunk offset `offset`. */
export function createWaterSampler(
  chunkSize: number,
  seed: number,
  offset: Vector2,
  climate: ClimateConfig,
  seaLevel: number,
  edit: WaterEdit | null
): WaterSampler {
  return {
    wasm: terrainGenerator(seed, climate, seaLevel).waterSampler(
      chunkSize,
      offset.x,
      offset.y,
      waterEditData(edit)
    ),
    level: seaLevel,
    ocean: 0,
    bodyId: OCEAN_BODY_ID,
  };
}

/**
 * The water's coverage at chunk sample (x, y), 0..1, with the palette's type
 * weights written into `types`. Also sets the sampler's level, ocean and
 * bodyId. Water shows where coverage is above zero and the ground is below
 * the level.
 */
export function sampleWater(
  s: WaterSampler,
  x: number,
  y: number,
  types: Float64Array
): number {
  const wasm = s.wasm;
  const coverage = wasm.sample(x, y);
  s.level = wasm.level;
  s.ocean = wasm.ocean;
  s.bodyId = wasm.bodyId;
  for (let c = 0; c < types.length; c++) types[c] = wasm.typeWeight(c);
  return coverage;
}

export function freeWaterSampler(s: WaterSampler): void {
  s.wasm.free();
}
