import type { ClimateConfig } from './Biomes';

// The water palette — what each kind of water looks like and how it moves.
//
// A climate lists its water types the way it lists its biomes. The water map
// stores one weight per palette entry, so a blend such as a lagoon is a plain
// weight blend of two entries. Game content, designed in code: a world stores
// only its climate preset id.

export type Rgb = [number, number, number];

export interface WaterType {
  // Which role the entry plays: generation looks entries up by these names.
  name: typeof OCEAN_WATER | typeof LAKE_WATER;
  // Linear colour of light scattered back out of deep water.
  scatter: Rgb;
  // Beer-Lambert absorption per metre, per channel. Tints the bed with depth.
  absorption: Rgb;
  // Extinction per metre from suspended sediment, the same on every channel.
  // Hides the bed without tinting it.
  turbidity: number;
  // 0..1: how strongly the wind raises waves on this water.
  waveResponse: number;
  // Dominant wavelength in metres at full wind: long swells or short ripples.
  waveScale: number;
  // Seconds for the waves to follow a change in wind.
  windLag: number;
  // 0..1: how much crest foam the wind raises.
  foam: number;
  // Water depth in metres over which shore foam shows.
  shoreFoamWidth: number;
  // 0..1: strength of the detail normal maps.
  normalStrength: number;
}

export const OCEAN_WATER = 'ocean';
export const LAKE_WATER = 'lake';

// The water map holds type weights in one RGBA8 texel.
export const MAX_WATER_TYPES = 4;

// Clear, deep blue sea. Red is gone within a few metres; blue carries.
export const OCEAN: WaterType = {
  name: OCEAN_WATER,
  scatter: [0.004, 0.03, 0.06],
  absorption: [0.45, 0.07, 0.03],
  turbidity: 0.04,
  waveResponse: 1,
  waveScale: 30,
  windLag: 40,
  foam: 1,
  shoreFoamWidth: 1.5,
  normalStrength: 1,
};

// Peaty inland water: blue is absorbed first, so the bed goes brown-green, and
// silt hides it within a couple of metres.
export const LAKE: WaterType = {
  name: LAKE_WATER,
  scatter: [0.02, 0.03, 0.015],
  absorption: [0.35, 0.25, 0.5],
  turbidity: 0.4,
  waveResponse: 0.35,
  waveScale: 4,
  windLag: 8,
  foam: 0.2,
  shoreFoamWidth: 0.4,
  normalStrength: 0.6,
};

// Shallow sea over white sand: turquoise, with the bed showing far out.
export const TROPICAL_OCEAN: WaterType = {
  ...OCEAN,
  scatter: [0.01, 0.08, 0.09],
  absorption: [0.4, 0.05, 0.04],
  turbidity: 0.02,
};

// Oasis water, clouded by fine sand.
export const SILTY_LAKE: WaterType = {
  ...LAKE,
  scatter: [0.05, 0.045, 0.03],
  absorption: [0.3, 0.3, 0.4],
  turbidity: 0.9,
};

/** Index of the named type in the climate's water palette, or -1. */
export function getWaterTypeIndex(
  climate: ClimateConfig,
  name: WaterType['name']
): number {
  const water = climate.water;
  if (!water) return -1;
  for (let i = 0; i < water.length; i++) if (water[i].name === name) return i;
  return -1;
}

function inUnitRange(value: number): boolean {
  return value >= 0 && value <= 1;
}

// Run by validateClimateLayers, so a bad palette surfaces at world load.
export function validateWaterPalette(climate: ClimateConfig): void {
  const water = climate.water ?? [];

  if (water.length > MAX_WATER_TYPES)
    throw new Error(
      `Climate has ${water.length} water types but the water map holds ${MAX_WATER_TYPES}.`
    );

  const seen = new Set<string>();
  for (const type of water) {
    if (seen.has(type.name))
      throw new Error(`Climate names water type '${type.name}' twice.`);
    seen.add(type.name);

    const colours = [...type.scatter, ...type.absorption];
    if (colours.some((c) => !(c >= 0)))
      throw new Error(
        `Water type '${type.name}' scatter and absorption must not be negative.`
      );
    if (!(type.turbidity >= 0))
      throw new Error(`Water type '${type.name}' turbidity must not be negative.`);
    if (!(type.waveScale > 0) || !(type.shoreFoamWidth > 0) || !(type.windLag > 0))
      throw new Error(
        `Water type '${type.name}' waveScale, shoreFoamWidth and windLag must be positive numbers.`
      );
    if (
      !inUnitRange(type.waveResponse) ||
      !inUnitRange(type.foam) ||
      !inUnitRange(type.normalStrength)
    )
      throw new Error(
        `Water type '${type.name}' waveResponse, foam and normalStrength must be within 0..1.`
      );
  }

  if (climate.continent && !seen.has(OCEAN_WATER))
    throw new Error(
      `Climate has a continent but no '${OCEAN_WATER}' water type to fill it.`
    );
}
