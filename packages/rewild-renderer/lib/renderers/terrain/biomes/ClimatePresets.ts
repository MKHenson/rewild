import { TERRAIN_METERS_PER_SAMPLE } from '../MeshGenerator';
import { LAKE, OCEAN, SILTY_LAKE, TROPICAL_OCEAN } from '../Water';
import { BEACH_SAND, DESERT, DESERT_MOUNTAIN } from './AridBiomes';
import type {
  ClimateConfig,
  CoastConfig,
  ContinentConfig,
  LakeConfig,
} from './BiomeTypes';
import { ARID_SEA, DEFAULT_SEA } from './WaterBiomes';
import { FOREST, MOUNTAIN, PLAIN } from './TemperateBiomes';

// Continents several times wider than a temperature band, so a coast runs past
// more than one biome.
export const DEFAULT_CONTINENT: ContinentConfig = {
  scale: 9000 / TERRAIN_METERS_PER_SAMPLE,
  seedSalt: 60013,
  coast: 0.44,
  blendHalfWidth: 0.03,
  shelfWidth: 0.03,
  shelfDepth: 6,
  slopeWidth: 0.06,
  oceanDepth: 45,
  coastalMoisture: 0.15,
  coastalMoistureReach: 0.08,
};

// Small lakes on gentle ground, a couple of kilometres apart.
export const DEFAULT_LAKES: LakeConfig = {
  cellSize: 1600 / TERRAIN_METERS_PER_SAMPLE,
  seedSalt: 70001,
  chance: 1.0,
  radius: {
    from: 50 / TERRAIN_METERS_PER_SAMPLE,
    to: 130 / TERRAIN_METERS_PER_SAMPLE,
  },
  irregularity: 0.25,
  bank: 1.8,
  depth: { from: 3, to: 8 },
  margin: 1,
  maxRimSlope: 8,
  moraine: 1,
  maxLagoonSlope: 25,
  lagoonChance: 0.8,
  lagoonRadius: {
    from: 120 / TERRAIN_METERS_PER_SAMPLE,
    to: 220 / TERRAIN_METERS_PER_SAMPLE,
  },
  spacing: 40 / TERRAIN_METERS_PER_SAMPLE,
  tarns: {
    radius: {
      from: 25 / TERRAIN_METERS_PER_SAMPLE,
      to: 50 / TERRAIN_METERS_PER_SAMPLE,
    },
    maxRimSlope: 50,
    lipShare: 0.2,
  },
};

// Small oases, mostly ponds among the dunes, whose ground is rarely gentle
// enough for a lake.
export const ARID_LAKES: LakeConfig = {
  ...DEFAULT_LAKES,
  chance: 0.3,
  maxRimSlope: 12,
  radius: {
    from: 30 / TERRAIN_METERS_PER_SAMPLE,
    to: 70 / TERRAIN_METERS_PER_SAMPLE,
  },
  depth: { from: 2, to: 4 },
};

// One sand for the beach and the sea bed; the waterline's wet look comes from
// the terrain shader.
export const DEFAULT_COAST: CoastConfig = {
  sand: 'aerial_beach_01',
  beachHeight: 3,
  wetHeight: 0.4,
  seabedDepth: 2,
  blend: 6,
  slope: { from: 30, to: 18 },
};

// Pale dry sand over darker wet sand, which also carpets the sea bed.
export const ARID_COAST: CoastConfig = {
  ...DEFAULT_COAST,
  sand: 'aerial_beach_01',
  wetSand: 'aerial_beach_02',
  beachHeight: 4,
};

// Temperature splits cold (mountain) from warm; moisture splits the warm half
// into dry (plain) and wet (forest). Cold ignores moisture, which is what
// sharing a biome across cells is for. Its sea reuses the land's materials, as
// the land and the coast fill all eight splat channels.
export const DEFAULT_CLIMATE: ClimateConfig = {
  label: 'Default',
  weather: 'temperate',
  temperature: {
    scale: 3000 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 7919,
    cuts: [0.4, 0.7],
    // A mountain loses ~300m of relief across this band, so a narrow one reads
    // as a cliff and a hard material line. Capped below 0.15 by the 0.3 gap
    // between the cuts.
    blendHalfWidth: 0.14,
  },
  moisture: {
    scale: 2400 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 104729,
    cuts: [],
    blendHalfWidth: 0.1,
  },
  continent: DEFAULT_CONTINENT,
  water: [OCEAN, LAKE],
  coast: DEFAULT_COAST,
  lakes: DEFAULT_LAKES,
  biomes: [PLAIN, FOREST, MOUNTAIN],
  cells: [
    [2], // cold → mountain
    [1], // mid  → FOREST
    [0], // warm → PLAIN
  ],
  sea: DEFAULT_SEA,
};

// A world with no wet half. Same salts as the default, so the same seed lays
// the borders in the same places; "moisture" here only means less dry.
export const ARID_CLIMATE: ClimateConfig = {
  label: 'Arid',
  weather: 'arid',
  temperature: {
    scale: 6000 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 7919,
    cuts: [0.4, 0.7],
    blendHalfWidth: 0.1,
  }, // 3 bands
  moisture: {
    scale: 4800 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 104729,
    cuts: [],
    blendHalfWidth: 0.1,
  }, // 1 band
  continent: DEFAULT_CONTINENT,
  water: [TROPICAL_OCEAN, SILTY_LAKE],
  coast: ARID_COAST,
  lakes: ARID_LAKES,
  biomes: [BEACH_SAND, DESERT, DESERT_MOUNTAIN],
  cells: [
    [2], // cold → desert mountain
    [1], // mid  → palm forest
    [0], // warm → dunes
  ],
  sea: ARID_SEA,
};

// Game content: designed in code, never persisted. A world stores only which
// preset it uses (WorldGenConfig.climatePreset).
export const DEFAULT_CLIMATE_PRESET = 'default';
export const ARID_CLIMATE_PRESET = 'arid';

// Ids are persisted, so renaming a key silently re-rolls every world that used
// it. Add, don't rename.
export const CLIMATE_PRESETS: Record<string, ClimateConfig> = {
  [DEFAULT_CLIMATE_PRESET]: DEFAULT_CLIMATE,
  [ARID_CLIMATE_PRESET]: ARID_CLIMATE,
};

// The preset picker's options, in declaration order.
export function getClimatePresets(): { id: string; label: string }[] {
  return Object.entries(CLIMATE_PRESETS).map(([id, climate]) => ({
    id,
    label: climate.label ?? id,
  }));
}

// Falls back to the default so a world saved against a removed preset loads.
export function resolveClimatePreset(id: string | undefined): ClimateConfig {
  if (id !== undefined && !CLIMATE_PRESETS[id])
    console.warn(
      `Unknown climate preset '${id}' — falling back to '${DEFAULT_CLIMATE_PRESET}'.`
    );
  return CLIMATE_PRESETS[id ?? DEFAULT_CLIMATE_PRESET] ?? DEFAULT_CLIMATE;
}
