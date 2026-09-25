import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  DEFAULT_CLIMATE,
  FOREST,
  MOUNTAIN,
  PLAIN,
} from '../terrain/Biomes';
import {
  createClimateField,
  resolveBiomeWeights,
  sampleContinent,
} from '../terrain/ClimateField';
import { TERRAIN_METERS_PER_SAMPLE } from '../terrain/MeshGenerator';
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

  it('stores the continent value at each texel centre, +x along rows and +z down columns', () => {
    const builder = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 500, -700, span, texels);
    expect(builder.build()).toBe(true);

    const world = createWorldClimateField(SEED, DEFAULT_CLIMATE);
    const step = span / texels;
    for (const [i, j] of [
      [0, 0],
      [5, 2],
      [7, 7],
    ]) {
      const x = 500 - span / 2 + (i + 0.5) * step;
      const z = -700 - span / 2 + (j + 0.5) * step;
      const stored = fromFloat16(builder.data[(i + j * texels) * 4 + 3]);
      expect(stored).toBeCloseTo(continentAtWorld(world, x, z), 3);
    }
  });

  it('colours land by the far colours of the biomes there', () => {
    const builder = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    builder.build();

    const world = createWorldClimateField(SEED, DEFAULT_CLIMATE);
    const biomes = new Int32Array(4);
    const weights = new Float64Array(4);
    const step = span / texels;
    for (const [i, j] of [
      [1, 1],
      [6, 3],
    ]) {
      const x = -span / 2 + (i + 0.5) * step;
      const z = -span / 2 + (j + 0.5) * step;
      const count = resolveBiomeWeights(
        world,
        x / TERRAIN_METERS_PER_SAMPLE,
        -z / TERRAIN_METERS_PER_SAMPLE,
        biomes,
        weights
      );
      let red = 0;
      for (let k = 0; k < count; k++)
        red += DEFAULT_CLIMATE.biomes[biomes[k]].farColor![0] * weights[k];
      expect(fromFloat16(builder.data[(i + j * texels) * 4])).toBeCloseTo(red, 3);
    }
  });

  it('uses a single biome\'s colour everywhere in a one-biome climate', () => {
    const forestOnly: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      temperature: { ...DEFAULT_CLIMATE.temperature, cuts: [] },
      biomes: [FOREST, PLAIN, MOUNTAIN],
      cells: [[0]],
    };
    const builder = new FarMapBuilder(SEED, forestOnly, 0, 0, span, texels);
    builder.build();
    for (let t = 0; t < texels * texels; t++)
      for (let ch = 0; ch < 3; ch++)
        expect(fromFloat16(builder.data[t * 4 + ch])).toBeCloseTo(
          FOREST.farColor![ch],
          3
        );
  });

  it('builds the same map a few rows at a time', () => {
    const whole = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    whole.build();
    const sliced = new FarMapBuilder(SEED, DEFAULT_CLIMATE, 0, 0, span, texels);
    let frames = 0;
    while (!sliced.build(3)) frames++;
    expect(frames).toBe(2);
    expect(sliced.data).toEqual(whole.data);
  });
});
