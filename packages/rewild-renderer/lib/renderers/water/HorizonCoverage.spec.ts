import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  DEFAULT_CLIMATE,
  FOREST,
  MAX_SPLAT_LAYERS,
  MOUNTAIN,
  PLAIN,
  getClimatePalette,
} from '../terrain/Biomes';
import { createClimateField, sampleContinent } from '../terrain/ClimateField';
import { TERRAIN_METERS_PER_SAMPLE } from '../terrain/MeshGenerator';
import { createGroundSampler, sampleGround } from '../terrain/Noise';
import { worldToLakeSpace } from '../terrain/Lakes';
import { fromFloat16 } from '../../utils/float16';
import {
  FarMapBuilder,
  continentAtWorld,
  createWorldClimateField,
} from './HorizonCoverage';

const SEED = 31337;
const CHUNK_SAMPLES = 241;
const SPAN = CHUNK_SAMPLES - 1;
const CHUNK_METRES = SPAN * TERRAIN_METERS_PER_SAMPLE;

describe('continentAtWorld', () => {
  it('matches what a chunk samples at the same world position', () => {
    const world = createWorldClimateField(SEED, DEFAULT_CLIMATE);

    for (const [cx, cy] of [
      [0, 0],
      [3, -2],
      [-5, 7],
    ]) {
      // TerrainChunk: noise offset coord * span, transform at coord * metres,
      // and MeshGenerator puts sample (sx, sy) at x = sx - span/2, z = span/2 - sy.
      const chunk = createClimateField(
        CHUNK_SAMPLES,
        CHUNK_SAMPLES,
        SEED,
        new Vector2(cx * SPAN, cy * SPAN),
        DEFAULT_CLIMATE
      );
      for (const [sx, sy] of [
        [0, 0],
        [40, 100],
        [240, 17],
      ]) {
        const x = cx * CHUNK_METRES + (sx - SPAN / 2) * TERRAIN_METERS_PER_SAMPLE;
        const z = cy * CHUNK_METRES + (SPAN / 2 - sy) * TERRAIN_METERS_PER_SAMPLE;
        expect(continentAtWorld(world, x, z)).toBeCloseTo(
          sampleContinent(chunk, sx, sy),
          9
        );
      }
    }
  });
});

describe('FarMapBuilder', () => {
  const texels = 8;
  const span = 16000;
  const step = span / texels;

  const continentAt = (b: FarMapBuilder, t: number) => fromFloat16(b.ground[t * 2 + 1]);
  const heightAt = (b: FarMapBuilder, t: number) => fromFloat16(b.ground[t * 2]);
  // Palette channel c of texel t, 0..255; channels 4-7 sit in the second plane.
  const weightAt = (b: FarMapBuilder, t: number, c: number) =>
    b.weights[(c >> 2) * texels * texels * 4 + t * 4 + (c & 3)];

  it('stores the continent value at each texel centre, +x along rows and +z down columns', () => {
    const builder = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 500, -700, span, texels);
    expect(builder.build()).toBe(true);

    const world = createWorldClimateField(SEED, DEFAULT_CLIMATE);
    for (const [i, j] of [
      [0, 0],
      [5, 2],
      [7, 7],
    ]) {
      const x = 500 - span / 2 + (i + 0.5) * step;
      const z = -700 - span / 2 + (j + 0.5) * step;
      expect(continentAt(builder, i + j * texels)).toBeCloseTo(
        continentAtWorld(world, x, z),
        3
      );
    }
  });

  it('stores the ground height at each texel centre', () => {
    const builder = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 300, 900, span, texels, 4);
    builder.build();

    const ground = createGroundSampler(SEED, DEFAULT_CLIMATE, 4);
    const lake = new Float64Array(2);
    for (const [i, j] of [
      [0, 0],
      [3, 6],
      [7, 1],
    ]) {
      const x = 300 - span / 2 + (i + 0.5) * step;
      const z = 900 - span / 2 + (j + 0.5) * step;
      worldToLakeSpace(x, z, lake);
      const expected = sampleGround(ground, lake[0], lake[1]);
      expect(Math.abs(heightAt(builder, i + j * texels) - expected)).toBeLessThan(
        Math.max(0.05, Math.abs(expected) / 1024)
      );
    }
  });

  it('weights every texel fully across the palette', () => {
    const builder = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    builder.build();
    for (let t = 0; t < texels * texels; t++) {
      let sum = 0;
      for (let c = 0; c < MAX_SPLAT_LAYERS; c++) sum += weightAt(builder, t, c);
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(MAX_SPLAT_LAYERS);
    }
  });

  it("surfaces a one-biome climate only in that biome's materials", () => {
    const forestOnly: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      continent: undefined,
      coast: undefined,
      temperature: { ...DEFAULT_CLIMATE.temperature, cuts: [] },
      biomes: [FOREST, PLAIN, MOUNTAIN],
      cells: [[0]],
    };
    const palette = getClimatePalette(forestOnly);
    const forest = new Set(FOREST.layers.map((l) => palette.indexOf(l.material)));
    const builder = new FarMapBuilder(SEED, forestOnly, 0, 0, span, texels);
    builder.build();
    for (let t = 0; t < texels * texels; t++)
      for (let c = 0; c < MAX_SPLAT_LAYERS; c++)
        if (!forest.has(c)) expect(weightAt(builder, t, c)).toBe(0);
  });

  it('snows mountain ground above the snow line and not below it', () => {
    const mountainOnly: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      continent: undefined,
      coast: undefined,
      temperature: { ...DEFAULT_CLIMATE.temperature, cuts: [] },
      biomes: [MOUNTAIN, PLAIN, FOREST],
      cells: [[0]],
    };
    const snow = getClimatePalette(mountainOnly).indexOf('snow_field_aerial');
    const builder = new FarMapBuilder(SEED, mountainOnly, 0, 0, 64000, 32);
    builder.build();
    let snowed = 0;
    for (let t = 0; t < 32 * 32; t++) {
      const h = fromFloat16(builder.ground[t * 2]);
      const w = builder.weights[(snow >> 2) * 32 * 32 * 4 + t * 4 + (snow & 3)];
      if (h < 150) expect(w).toBe(0);
      if (h > 200 && w > 0) snowed++;
    }
    expect(snowed).toBeGreaterThan(0);
  });

  it('builds the same map a few rows at a time', () => {
    const whole = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    whole.build();
    const sliced = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    let frames = 0;
    while (!sliced.build(3)) frames++;
    expect(frames).toBe(5);
    expect(sliced.ground).toEqual(whole.ground);
    expect(sliced.weights).toEqual(whole.weights);
  });
});
