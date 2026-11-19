import {
  BiomeScatter,
  CLIMATE_PRESETS,
  ClimateConfig,
  DEFAULT_CLIMATE,
  DEFAULT_CLIMATE_PRESET,
  MOUNTAIN,
  resolveClimatePreset,
  validateBiomeScatter,
  validateClimateLayers,
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

describe('sea biomes', () => {
  const sea = DEFAULT_CLIMATE.sea!;

  it('accepts the shipped presets', () => {
    for (const climate of Object.values(CLIMATE_PRESETS))
      expect(() => validateClimateLayers(climate)).not.toThrow();
  });

  it('rejects cells that do not follow the temperature bands and zones', () => {
    const rows: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      sea: { ...sea, cells: sea.cells.slice(1) },
    };
    expect(() => validateClimateLayers(rows)).toThrow(/temperature rows/);
    const zones: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      sea: { ...sea, zones: sea.zones.slice(1) },
    };
    expect(() => validateClimateLayers(zones)).toThrow(/zone entries/);
    const index: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      sea: { ...sea, cells: sea.cells.map((row) => row.map(() => 99)) },
    };
    expect(() => validateClimateLayers(index)).toThrow(/out of range/);
  });

  it('rejects a sea biome named like a land biome', () => {
    const climate: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      sea: {
        ...sea,
        biomes: sea.biomes.map((b, i) =>
          i === 0 ? { ...b, name: DEFAULT_CLIMATE.biomes[0].name } : b
        ),
      },
    };
    expect(() => validateClimateLayers(climate)).toThrow(/shares its name/);
  });

  it('rejects a zone whose water type the palette lacks', () => {
    const climate: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      water: DEFAULT_CLIMATE.water!.filter((type) => type.name !== 'lake'),
      lakes: undefined,
    };
    expect(() => validateClimateLayers(climate)).toThrow(/Sea zone 'lake'/);
  });

  it('rejects a handover that does not deepen', () => {
    const climate: ClimateConfig = {
      ...DEFAULT_CLIMATE,
      sea: { ...sea, handover: { from: 2, to: 1 } },
    };
    expect(() => validateClimateLayers(climate)).toThrow(/handover/);
  });
});
