import {
  ARID_CLIMATE,
  BiomeScatter,
  CLIMATE_PRESETS,
  ClimateConfig,
  DEFAULT_CLIMATE,
  DEFAULT_CLIMATE_PRESET,
  MOUNTAIN,
  getClimateScatterLayers,
  resolveClimatePreset,
  validateBiomeScatter,
} from './Biomes';
import { getScatterLayerOrder } from './ScatterLayers';

function climateWithScatter(scatter: BiomeScatter[]): ClimateConfig {
  return {
    temperature: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    moisture: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    biomes: [{ ...MOUNTAIN, scatter }],
    cells: [[0]],
  };
}

describe('resolveClimatePreset', () => {
  it('resolves a known preset id', () => {
    expect(resolveClimatePreset(DEFAULT_CLIMATE_PRESET)).toBe(DEFAULT_CLIMATE);
  });

  it('falls back to the default preset when the id is missing', () => {
    expect(resolveClimatePreset(undefined)).toBe(
      CLIMATE_PRESETS[DEFAULT_CLIMATE_PRESET]
    );
  });

  it('falls back to the default preset for an unknown id, with a warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveClimatePreset('no-such-era')).toBe(DEFAULT_CLIMATE);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('getClimateScatterLayers', () => {
  it('lists only the layers a climate actually grows', () => {
    const grown = new Set(
      DEFAULT_CLIMATE.biomes.flatMap((biome) =>
        (biome.scatter ?? []).map((rule) => rule.layer)
      )
    );
    expect(new Set(getClimateScatterLayers(DEFAULT_CLIMATE))).toEqual(grown);
  });

  // Channels are library slots, so the order has to come from the library
  // rather than from which biome happened to mention a layer first.
  it('orders by library slot, not by biome', () => {
    const library = getScatterLayerOrder();
    for (const climate of [DEFAULT_CLIMATE, ARID_CLIMATE]) {
      const slots = getClimateScatterLayers(climate).map((name) =>
        library.indexOf(name)
      );
      expect(slots).toEqual([...slots].sort((a, b) => a - b));
    }
  });

  it('is empty for a climate that grows nothing', () => {
    expect(getClimateScatterLayers(climateWithScatter([]))).toEqual([]);
  });
});

describe('validateBiomeScatter', () => {
  it('accepts the shipped presets', () => {
    for (const climate of Object.values(CLIMATE_PRESETS))
      expect(() => validateBiomeScatter(climate)).not.toThrow();
  });

  it('rejects a layer outside the library', () => {
    expect(() =>
      validateBiomeScatter(
        climateWithScatter([{ layer: 'no-such-layer', density: 0.5 }])
      )
    ).toThrow(/unknown scatter layer/);
  });

  // Rules do not composite, so a repeat would silently double the density.
  it('rejects a layer named twice in one biome', () => {
    expect(() =>
      validateBiomeScatter(
        climateWithScatter([
          { layer: 'granite_pebble', density: 0.2 },
          { layer: 'granite_pebble', density: 0.3 },
        ])
      )
    ).toThrow(/twice/);
  });

  it('rejects a density outside (0, 1]', () => {
    for (const density of [0, -0.1, 1.5])
      expect(() =>
        validateBiomeScatter(
          climateWithScatter([{ layer: 'granite_pebble', density }])
        )
      ).toThrow(/density .* must be within/);
  });
});
