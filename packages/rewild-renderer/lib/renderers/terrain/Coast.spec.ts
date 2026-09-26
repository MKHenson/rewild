import { Vector2 } from 'rewild-common';
import {
  ARID_COAST,
  BiomeParams,
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
import { coastalMoistureAt } from './ClimateField';
import { resolveCoastWeights } from './LayerWeights';
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

describe('resolveCoastWeights', () => {
  const out = new Float64Array(3);
  const c = DEFAULT_COAST;

  it('is dry sand on the beach, wet sand at the waterline and sea bed below', () => {
    expect(resolveCoastWeights(c, 2, 0, 1, out)).toBeCloseTo(1, 6);
    expect(Array.from(out)).toEqual([1, 0, 0]);

    resolveCoastWeights(c, 0, 0, 1, out);
    expect(Array.from(out)).toEqual([0, 1, 0]);

    resolveCoastWeights(c, -5, 0, 1, out);
    expect(Array.from(out)).toEqual([0, 0, 1]);
  });

  it('takes nothing above the beach, on steep ground or away from the ocean', () => {
    expect(resolveCoastWeights(c, c.beachHeight + c.blend + 1, 0, 1, out)).toBe(0);
    expect(resolveCoastWeights(c, 1, 45, 1, out)).toBe(0);
    expect(resolveCoastWeights(c, 1, 0, 0, out)).toBe(0);
  });

  it('splits exactly its total into non-negative bands, even when blends overlap', () => {
    const overlapping: CoastConfig = { ...c, wetHeight: 0.2, seabedDepth: 0.5, blend: 3 };
    for (const coast of [c, overlapping]) {
      for (let h = -8; h <= 8; h += 0.25) {
        const total = resolveCoastWeights(coast, h, 10, 0.7, out);
        expect(out[0] + out[1] + out[2]).toBeCloseTo(total, 9);
        for (const w of out) expect(w).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

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
  const count = (climate: ClimateConfig) =>
    scatterChunk(SIZE, SEED, new Vector2(0, 0), climate, flat(1), { seaLevel: 0 })
      .reduce((n, layer) => n + layer.count, 0);

  it('grows nothing from the biomes on the beach', () => {
    expect(count(climateFor(PLAIN, -1))).toBeGreaterThan(0);
    expect(count(climateFor(PLAIN, 2))).toBe(0);
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

    expect(lowest(climateFor(PLAIN, -1))).toBeLessThan(0);
    expect(lowest(climateFor(PLAIN, 2))).toBeGreaterThanOrEqual(0);
  });
});

describe('coastalMoistureAt', () => {
  const continent = DEFAULT_CONTINENT;

  it('adds the full amount at the coast and seaward, fading out inland', () => {
    const amount = continent.coastalMoisture!;
    const reach = continent.coastalMoistureReach!;
    expect(coastalMoistureAt(continent, continent.coast - 0.1)).toBe(amount);
    expect(coastalMoistureAt(continent, continent.coast)).toBe(amount);
    expect(coastalMoistureAt(continent, continent.coast + reach / 2)).toBeCloseTo(amount / 2, 6);
    expect(coastalMoistureAt(continent, continent.coast + reach)).toBe(0);
  });

  it('adds nothing when the continent asks for none', () => {
    expect(coastalMoistureAt({ ...continent, coastalMoisture: undefined }, 0)).toBe(0);
  });
});
