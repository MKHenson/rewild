import { LAKE_WATER } from '../Water';
import type { BiomeScatter } from './BiomeTypes';

// Reed beds along lake shores, from just above the waterline into the shallows.
export const REEDS: BiomeScatter = {
  layer: 'reed_01',
  waterType: LAKE_WATER,
  density: 0.2,
  slope: { from: 20, to: 6 },
  waterDepth: [
    { from: -2.5, to: -2.0 },
    { from: 0.5, to: 0.2 },
  ],
  underwater: true,
  noise: { scale: 10, seedSalt: 131, band: { from: 0.35, to: 0.6 } },
};
