import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  ContinentConfig,
  DEFAULT_CLIMATE,
  DEFAULT_CONTINENT,
} from './Biomes';
import { generateBiomeBlendedHeightMap } from './Noise';
import {
  OCEAN_BODY_ID,
  WATER_MAP_STEP,
  WaterMap,
  buildWaterMap,
  packWaterSurface,
} from './WaterMap';
import { oceanCoverage } from './ClimateField';
import { fromFloat16 } from '../../utils/float16';

const CHUNK_SIZE = 65;
const SIZE = (CHUNK_SIZE - 1) / WATER_MAP_STEP + 1;
const SEED = 4242;

function climateWith(continent: ContinentConfig | undefined): ClimateConfig {
  return { ...DEFAULT_CLIMATE, continent };
}

function build(
  climate: ClimateConfig,
  offsetX = 0,
  offsetY = 0,
  seaLevel = 0,
  heights?: Float32Array
): WaterMap | null {
  const offset = new Vector2(offsetX, offsetY);
  const h =
    heights ??
    generateBiomeBlendedHeightMap(
      CHUNK_SIZE,
      CHUNK_SIZE,
      SEED,
      offset,
      climate,
      seaLevel
    );
  return buildWaterMap(CHUNK_SIZE, SEED, offset, climate, seaLevel, h);
}

const OPEN_OCEAN = climateWith({ ...DEFAULT_CONTINENT, coast: 2 });
const INLAND = climateWith({ ...DEFAULT_CONTINENT, coast: -1 });
// A continent small enough that a coast crosses one test chunk.
const COASTAL = climateWith({ ...DEFAULT_CONTINENT, scale: 40, coast: 0.5 });

// The water map rules are tested in Rust (crates/terrain/src/tests.rs). These
// pin the shipped presets through the WASM boundary.
describe('buildWaterMap', () => {
  it('is null for a climate with no continent', () => {
    expect(build(climateWith(undefined))).toBeNull();
  });

  it('is null inland', () => {
    expect(build(INLAND)).toBeNull();
  });

  it('is null where the ocean is covered but the ground stands above it', () => {
    const high = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(5);
    expect(build(OPEN_OCEAN, 0, 0, 0, high)).toBeNull();
  });

  it('fills open ocean at sea level with ocean water', () => {
    const water = build(OPEN_OCEAN, 0, 0, 12)!;
    expect(water.size).toBe(SIZE);
    expect(water.baseLevel).toBe(12);
    expect(water.maxLevel).toBe(12);
    for (let t = 0; t < SIZE * SIZE; t++) {
      expect(water.coverage[t]).toBe(255);
      expect(fromFloat16(water.level[t])).toBe(0);
      expect(water.bodyIds[t]).toBe(OCEAN_BODY_ID);
      expect(water.typeWeights[t * 4]).toBe(255);
      expect(water.typeWeights[t * 4 + 1]).toBe(0);
      expect(water.flow[t * 2]).toBe(0);
      expect(water.flow[t * 2 + 1]).toBe(0);
    }
  });

  it('covers only part of a coastal chunk', () => {
    const water = build(COASTAL)!;
    expect(water).not.toBeNull();
    let dry = 0;
    let wet = 0;
    for (let t = 0; t < SIZE * SIZE; t++) {
      if (water.coverage[t] === 0) dry++;
      if (water.coverage[t] === 255) wet++;
      expect(water.typeWeights[t * 4]).toBe(water.coverage[t] > 0 ? 255 : 0);
    }
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeGreaterThan(0);
  });

});

describe('oceanCoverage', () => {
  const c = DEFAULT_CONTINENT;

  it('is full across the whole coast blend and fades out inland', () => {
    expect(oceanCoverage(c, 0)).toBe(1);
    expect(oceanCoverage(c, c.coast)).toBe(1);
    expect(oceanCoverage(c, c.coast + c.blendHalfWidth)).toBe(1);
    expect(oceanCoverage(c, c.coast + 1.5 * c.blendHalfWidth)).toBeCloseTo(0.5, 6);
    expect(oceanCoverage(c, c.coast + 2 * c.blendHalfWidth)).toBe(0);
    expect(oceanCoverage(c, 1)).toBe(0);
  });
});

describe('packWaterSurface', () => {
  it('interleaves level, terrain height and coverage per texel', () => {
    const water = build(COASTAL)!;
    const packed = packWaterSurface(water);
    expect(packed.length).toBe(SIZE * SIZE * 4);
    for (let t = 0; t < SIZE * SIZE; t++) {
      expect(packed[t * 4]).toBe(water.level[t]);
      expect(packed[t * 4 + 1]).toBe(water.heights[t]);
      expect(fromFloat16(packed[t * 4 + 2])).toBeCloseTo(
        water.coverage[t] / 255,
        3
      );
      expect(fromFloat16(packed[t * 4 + 3])).toBe(0);
    }
  });

  it('reuses a buffer of the right size', () => {
    const water = build(COASTAL)!;
    const out = new Uint16Array(SIZE * SIZE * 4);
    expect(packWaterSurface(water, out)).toBe(out);
    expect(packWaterSurface(water, new Uint16Array(3))).not.toBe(out);
  });
});
