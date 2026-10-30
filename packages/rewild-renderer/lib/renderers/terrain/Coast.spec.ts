import { Vector2 } from 'rewild-common';
import {
  ARID_COAST,
  BiomeParams,
  BiomeScatter,
  CLIMATE_PRESETS,
  ClimateConfig,
  CoastConfig,
  DEFAULT_CLIMATE,
  DEFAULT_COAST,
  DEFAULT_CONTINENT,
  PLAIN,
  getClimatePalette,
  validateClimateLayers,
} from './Biomes';
import { SCATTER_INSTANCE_STRIDE, scatterChunk } from './Scatter';
import { generateSplatMap } from './Splat';

const SIZE = 33;
const SEED = 777;

function climateFor(
  biome: BiomeParams,
  coastValue: number,
  coast: CoastConfig = DEFAULT_COAST
): ClimateConfig {
  return {
    ...DEFAULT_CLIMATE,
    temperature: { ...DEFAULT_CLIMATE.temperature, cuts: [] },
    continent: { ...DEFAULT_CONTINENT, coast: coastValue },
    coast,
    biomes: [biome],
    cells: [[0]],
  };
}

const flat = (height: number) => new Float32Array(SIZE * SIZE).fill(height);

describe('beach splat', () => {
  const sandChannel = (climate: ClimateConfig) =>
    getClimatePalette(climate).indexOf(DEFAULT_COAST.sand);

  function sandShare(climate: ClimateConfig, heights: Float32Array, seaLevel = 0) {
    const splat = generateSplatMap(SIZE, SIZE, SEED, new Vector2(0, 0), climate, heights, {
      seaLevel,
    });
    const channel = sandChannel(climate);
    const plane = SIZE * SIZE * 4;
    let sum = 0;
    for (let t = 0; t < SIZE * SIZE; t++)
      sum += channel < 4 ? splat[t * 4 + channel] : splat[plane + t * 4 + channel - 4];
    return sum / (SIZE * SIZE * 255);
  }

  it('turns low ground beside the ocean to sand', () => {
    expect(sandShare(climateFor(PLAIN, 2), flat(1))).toBeCloseTo(1, 2);
  });

  it('leaves low ground inland as the biome made it', () => {
    expect(sandShare(climateFor(PLAIN, -1), flat(1))).toBe(0);
  });

  it('measures the beach from the sea level', () => {
    expect(sandShare(climateFor(PLAIN, 2), flat(51), 50)).toBeCloseTo(1, 2);
    expect(sandShare(climateFor(PLAIN, 2), flat(51), 0)).toBe(0);
  });

  it.each(Object.keys(CLIMATE_PRESETS))(
    'fits the shipped coast in the splat map (%s)',
    (id) => {
      expect(CLIMATE_PRESETS[id].coast).toBeDefined();
      expect(() => validateClimateLayers(CLIMATE_PRESETS[id])).not.toThrow();
    }
  );

  it('uses both sands on the arid coast', () => {
    const palette = getClimatePalette(CLIMATE_PRESETS.arid);
    expect(palette).toContain(ARID_COAST.sand);
    expect(palette).toContain(ARID_COAST.wetSand);
  });
});

describe('beach scatter', () => {
  const LAND = { ...PLAIN, scatter: PLAIN.scatter!.filter((rule) => !rule.underwater) };

  const count = (climate: ClimateConfig) =>
    scatterChunk(SIZE, SEED, new Vector2(0, 0), climate, flat(1), { seaLevel: 0 })
      .reduce((n, layer) => n + layer.count, 0);

  it('grows nothing from the biomes on the beach', () => {
    expect(count(climateFor(LAND, -1))).toBeGreaterThan(0);
    expect(count(climateFor(LAND, 2))).toBe(0);
  });

  // Too steep for sand, so only the ocean itself can keep scatter off it.
  it('grows nothing from the biomes on steep ground under the sea', () => {
    const steep = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) steep[x + y * SIZE] = -60 + x * 2.5;

    const lowest = (climate: ClimateConfig) => {
      let min = Infinity;
      for (const layer of scatterChunk(SIZE, SEED, new Vector2(0, 0), climate, steep, {
        seaLevel: 0,
      }))
        for (let i = 0; i < layer.count; i++)
          min = Math.min(min, layer.data[i * SCATTER_INSTANCE_STRIDE + 1]);
      return min;
    };

    expect(lowest(climateFor(LAND, -1))).toBeLessThan(0);
    expect(lowest(climateFor(LAND, 2))).toBeGreaterThanOrEqual(0);
  });
});

describe('water scatter', () => {
  const withRule = (rule: Partial<BiomeScatter>): BiomeParams => ({
    ...PLAIN,
    scatter: [{ layer: 'granite_01', density: 1, ...rule }],
  });

  const count = (biome: BiomeParams, height: number, coast = -1) =>
    scatterChunk(SIZE, SEED, new Vector2(0, 0), climateFor(biome, coast), flat(height), {
      seaLevel: 0,
    }).reduce((n, layer) => n + layer.count, 0);

  it('grows under the sea only when the rule says so', () => {
    expect(count(withRule({}), -5, 2)).toBe(0);
    expect(count(withRule({ underwater: true }), -5, 2)).toBeGreaterThan(0);
  });

  it('grows within its depth range', () => {
    const shelf = withRule({ underwater: true, waterDepth: { from: 2, to: 4 } });
    expect(count(shelf, -5, 2)).toBeGreaterThan(0);
    expect(count(shelf, -1, 2)).toBe(0);
  });

  it('grows above the water where the sea reaches, not inland', () => {
    const driftwood = withRule({ waterDepth: [{ from: -4, to: -2 }, { from: 0, to: -1 }] });
    expect(count(driftwood, 1, 2)).toBeGreaterThan(0);
    expect(count(driftwood, 1, -1)).toBe(0);
    expect(count(driftwood, 6, 2)).toBe(0);
  });

  it('grows only where its water type has weight', () => {
    expect(count(withRule({ underwater: true, waterType: 'ocean' }), -5, 2)).toBeGreaterThan(0);
    expect(count(withRule({ underwater: true, waterType: 'lake' }), -5, 2)).toBe(0);
  });

  it('rejects a water type the palette lacks', () => {
    const climate = {
      ...climateFor(withRule({ waterType: 'lake' }), 2),
      water: DEFAULT_CLIMATE.water!.filter((type) => type.name !== 'lake'),
      lakes: undefined,
    };
    expect(() => validateClimateLayers(climate)).toThrow(/water type 'lake'/);
  });
});
