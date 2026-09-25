import {
  CLIMATE_PRESETS,
  ClimateConfig,
  DEFAULT_CLIMATE,
  validateClimateLayers,
} from './Biomes';
import {
  LAKE,
  LAKE_WATER,
  MAX_WATER_TYPES,
  OCEAN,
  OCEAN_WATER,
  WaterType,
  getWaterTypeIndex,
  validateWaterPalette,
} from './Water';

function climateWithWater(water: WaterType[] | undefined): ClimateConfig {
  return { ...DEFAULT_CLIMATE, water };
}

describe('water palette', () => {
  it.each(Object.keys(CLIMATE_PRESETS))(
    'is valid on the shipped preset (%s)',
    (id) => {
      expect(() => validateClimateLayers(CLIMATE_PRESETS[id])).not.toThrow();
      expect(getWaterTypeIndex(CLIMATE_PRESETS[id], OCEAN_WATER)).toBe(0);
      expect(getWaterTypeIndex(CLIMATE_PRESETS[id], LAKE_WATER)).toBe(1);
    }
  );

  it('finds no type in a climate without water', () => {
    const dry = { ...DEFAULT_CLIMATE, continent: undefined, water: undefined };
    expect(getWaterTypeIndex(dry, OCEAN_WATER)).toBe(-1);
    expect(() => validateWaterPalette(dry)).not.toThrow();
  });

  it('requires an ocean type when the climate has a continent', () => {
    expect(() => validateWaterPalette(climateWithWater([LAKE]))).toThrow();
    expect(() => validateWaterPalette(climateWithWater(undefined))).toThrow();
  });

  it('rejects more types than the water map holds', () => {
    const water = new Array(MAX_WATER_TYPES + 1).fill(OCEAN);
    expect(() => validateWaterPalette(climateWithWater(water))).toThrow();
  });

  it('rejects a type named twice', () => {
    expect(() =>
      validateWaterPalette(climateWithWater([OCEAN, LAKE, OCEAN]))
    ).toThrow();
  });

  it.each<[string, Partial<WaterType>]>([
    ['negative absorption', { absorption: [0.4, -0.1, 0.02] }],
    ['negative scatter', { scatter: [-0.01, 0.03, 0.06] }],
    ['negative turbidity', { turbidity: -1 }],
    ['zero wave scale', { waveScale: 0 }],
    ['zero wind lag', { windLag: 0 }],
    ['zero shore foam width', { shoreFoamWidth: 0 }],
    ['wave response above 1', { waveResponse: 1.5 }],
    ['foam below 0', { foam: -0.1 }],
    ['normal strength above 1', { normalStrength: 2 }],
  ])('rejects %s', (_, change) => {
    const water = [{ ...OCEAN, ...change }, LAKE];
    expect(() => validateWaterPalette(climateWithWater(water))).toThrow();
  });
});
