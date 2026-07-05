export interface BiomeParams {
  name: string;
  heightScale: number; // max height in meters this biome can reach
  noiseScale: number; // horizontal feature size in world-units; bigger → broader, gentler forms
  octaves: number;
  persistence: number;
  lacunarity: number;
  heightCurveExp: number; // exponent on normalised height; >1 flattens mids while keeping peaks
}

// One climate dimension (temperature or moisture): a low-frequency noise field
// over world position, split into bands by `cuts`. Which biome a sample gets is
// looked up from the (temperature band, moisture band) cell in ClimateConfig.
export interface ClimateAxis {
  scale: number; // feature size in world-units; much larger than the height noise so a band spans many chunks
  seedSalt: number; // added to the world seed so this axis is decorrelated from the height noise and the other axis
  cuts: number[]; // ascending values in (0,1); cuts.length+1 bands. Adjacent cuts must be more than 2*blendHalfWidth apart.
  blendHalfWidth: number; // half-width of the smoothstep transition band around each cut
}

// The whole climate model: two axes plus a biome lookup grid.
// cells[temperatureBand][moistureBand] is an index into `biomes`; multiple
// cells may share a biome. Adding a biome = a table row + a cut + cell entries.
export interface ClimateConfig {
  temperature: ClimateAxis;
  moisture: ClimateAxis;
  biomes: BiomeParams[];
  cells: number[][];
}

// Biome parameter table. Rows are data — adding a biome is a table edit.
export const PLAIN: BiomeParams = {
  name: 'plain',
  heightScale: 20,
  noiseScale: 400,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  heightCurveExp: 1.1,
};

// 200m peaks need broad bases: noiseScale 800 keeps typical slopes in the
// 35–55° range (400 would give spikes), and heightCurveExp 2.0 keeps most of
// the region at moderate height so full-height peaks read as landmarks.
export const MOUNTAIN: BiomeParams = {
  name: 'mountain',
  heightScale: 200,
  noiseScale: 800,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.0,
  heightCurveExp: 2.0,
};

// Two biomes split across temperature only: cold → mountain, warm → plain.
// The moisture axis is defined but uncut until a biome needs it (e.g. a desert
// row later is a moisture cut + new cell entries, no new code).
export const DEFAULT_CLIMATE: ClimateConfig = {
  temperature: {
    scale: 3000,
    seedSalt: 7919,
    cuts: [0.5],
    blendHalfWidth: 0.05,
  },
  moisture: {
    scale: 2400,
    seedSalt: 104729,
    cuts: [],
    blendHalfWidth: 0.05,
  },
  biomes: [PLAIN, MOUNTAIN],
  cells: [
    [1], // cold → mountain
    [0], // warm → plain
  ],
};

// Tallest possible terrain across a climate's biomes — used to normalise
// absolute world height (meters) back to [0,1], e.g. for the colour bands.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    if (biome.heightScale > max) max = biome.heightScale;
  }
  return max;
}

export const MAX_WORLD_HEIGHT = getMaxWorldHeight(DEFAULT_CLIMATE);
