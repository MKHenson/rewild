import {
  BiomeScatter,
  CLIMATE_PRESETS,
  ClimateConfig,
  DEFAULT_CLIMATE,
  DEFAULT_CLIMATE_PRESET,
  MOUNTAIN,
  resolveClimatePreset,
  validateBiomeScatter,
} from './Biomes';

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
          { layer: 'granite_pebble_01', density: 0.2 },
          { layer: 'granite_pebble_01', density: 0.3 },
        ])
      )
    ).toThrow(/twice/);
  });

  it('rejects a density outside (0, 1]', () => {
    for (const density of [0, -0.1, 1.5])
      expect(() =>
        validateBiomeScatter(
          climateWithScatter([{ layer: 'granite_pebble_01', density }])
        )
      ).toThrow(/density .* must be within/);
  });
});
