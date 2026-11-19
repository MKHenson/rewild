import { LAKE_WATER } from '../Water';
import type { BiomeCreatures, BiomeScatter } from './BiomeTypes';

// Fish in any sea the biome holds; the habitat keeps them to open water.
export const TUNA: BiomeCreatures = {
  creature: 'tuna',
  density: 0.4,
  group: [1, 3],
  spread: 6,
};

// Reed beds along lake shores, from just above the waterline into the shallows.
export const REEDS: BiomeScatter = {
  layer: 'reed_01',
  waterType: LAKE_WATER,
  density: 0.2,
  slope: { from: 20, to: 6 },
  waterDepth: [
    { from: -2.5, to: -2.0 },
    { from: 2.5, to: 2.2 },
  ],
  underwater: true,
  noise: { scale: 10, seedSalt: 131, band: { from: 0.35, to: 0.6 } },
};

// Pondweed in lake shallows, past the reeds.
export const LAKE_WEED: BiomeScatter[] = [
  {
    layer: 'seagrass_02',
    density: 0.7,
    waterDepth: [
      { from: 0.0, to: 0.4 },
      { from: 4, to: 3.5 },
    ],
    waterType: LAKE_WATER,
    underwater: true,
    noise: { scale: 16, seedSalt: 149, band: { from: 0.35, to: 0.55 } },
  },
  {
    layer: 'pondweed_01',
    density: 0.5,
    waterDepth: [
      { from: 0.1, to: 0.3 },
      { from: 3.5, to: 2.8 },
    ],
    waterType: LAKE_WATER,
    underwater: true,
    noise: { scale: 9, seedSalt: 137, band: { from: 0.4, to: 0.6 } },
  },
];

// The sea bed, by depth and distance from shore: seagrass meadows and sugar
// kelp in the shallows, giant and feather boa kelp in forests over the shelf,
// and bull kelp scattered among them. Each stand is a patch of the noise, so
// the shelf holds stands with open sand between.
export const SEABED: BiomeScatter[] = [
  {
    layer: 'seagrass_01',
    density: 0.7,
    waterDepth: [
      { from: 0.4, to: 0.8 },
      { from: 7, to: 5 },
    ],
    shore: [{ from: 120, to: 80 }],
    waterType: 'ocean',
    underwater: true,
    noise: { scale: 16, seedSalt: 149, band: { from: 0.35, to: 0.55 } },
  },
  {
    layer: 'kelp_sugar_01',
    density: 0.12,
    waterDepth: [
      { from: 0.6, to: 1 },
      { from: 4, to: 3 },
    ],
    shore: [{ from: 40, to: 25 }],
    waterType: 'ocean',
    underwater: true,
    noise: { scale: 12, seedSalt: 151, band: { from: 0.4, to: 0.6 } },
  },
  {
    layer: 'kelp_01',
    density: 0.45,
    waterDepth: [
      { from: 2.5, to: 3.5 },
      { from: 25, to: 18 },
    ],
    shore: [
      { from: 15, to: 30 },
      { from: 220, to: 180 },
    ],
    waterType: 'ocean',
    underwater: true,
    noise: { scale: 30, seedSalt: 157, band: { from: 0.45, to: 0.6 } },
  },
  {
    layer: 'kelp_boa_01',
    density: 0.25,
    waterDepth: [
      { from: 2, to: 3 },
      { from: 14, to: 10 },
    ],
    shore: [
      { from: 10, to: 20 },
      { from: 160, to: 120 },
    ],
    waterType: 'ocean',
    underwater: true,
    noise: { scale: 24, seedSalt: 163, band: { from: 0.55, to: 0.7 } },
  },
  {
    layer: 'kelp_bull_01',
    density: 0.06,
    waterDepth: [
      { from: 3, to: 4 },
      { from: 25, to: 18 },
    ],
    shore: [
      { from: 20, to: 40 },
      { from: 220, to: 180 },
    ],
    waterType: 'ocean',
    underwater: true,
  },
];
