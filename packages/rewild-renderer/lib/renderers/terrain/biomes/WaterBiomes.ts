// The biomes under water, ocean and lake: their zones, beds, plants and creatures.
import { LAKE_WATER, OCEAN_WATER } from '../Water';
import type {
  BiomeCreatures,
  SeaBiomeParams,
  SeaConfig,
  SeaScatter,
  SeaZone,
} from './BiomeTypes';

// Fish in open water; the habitat keeps them off the bed.
export const TUNA: BiomeCreatures = {
  creature: 'tuna',
  density: 25,
  group: [1, 6],
  spread: 6,
};

// Lake fish, alone or in twos and threes.
export const TROUT: BiomeCreatures = {
  creature: 'trout',
  density: 25,
  group: [1, 3],
  spread: 3,
};

// Depth bands of the ocean, each handing over to the next across a few metres.
// The shelf reaches past the shelf edge onto the top of the slope, where the
// kelp still holds.
export const SEA_ZONES: SeaZone[] = [
  { name: 'shallows', waterType: OCEAN_WATER, depth: { from: 3, to: 2 } },
  {
    name: 'shelf',
    waterType: OCEAN_WATER,
    depth: [
      { from: 2, to: 3 },
      { from: 20, to: 16 },
    ],
  },
  {
    name: 'slope',
    waterType: OCEAN_WATER,
    depth: [
      { from: 16, to: 20 },
      { from: 35, to: 28 },
    ],
  },
  { name: 'open', waterType: OCEAN_WATER, depth: { from: 28, to: 35 } },
  { name: 'lake', waterType: LAKE_WATER },
];

// Sea biomes take the bed over a metre and a half below the waterline, so the
// beach's wet sand and the land's waterline rules keep the edge.
const HANDOVER = { from: 0.3, to: 1.5 };

const SEAGRASS: SeaScatter = {
  layer: 'seagrass_01',
  density: 0.7,
  waterDepth: [
    { from: 0.4, to: 0.8 },
    { from: 7, to: 5 },
  ],
  shore: [{ from: 120, to: 80 }],
  noise: { scale: 16, seedSalt: 149, band: { from: 0.35, to: 0.55 } },
};

// Cobbles on the bed, thinning on steep ground.
const BED_PEBBLES: SeaScatter = {
  layer: 'granite_pebble_01',
  density: 0.15,
  slope: { from: 30, to: 10 },
  noise: { scale: 40, seedSalt: 167, band: { from: 0.4, to: 0.65 } },
};

// Sugar kelp in the shallows of the shelf, giant and feather boa kelp in
// forests over it, and bull kelp scattered among them. Each stand is a patch
// of the noise, so the shelf holds stands with open ground between.
const KELP: SeaScatter[] = [
  {
    layer: 'kelp_sugar_01',
    density: 0.12,
    waterDepth: [
      { from: 0.6, to: 1 },
      { from: 4, to: 3 },
    ],
    shore: [{ from: 40, to: 25 }],
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
  },
];

// Pondweed past the reeds, giving way to bare silt in deep water.
const LAKE_WEED: SeaScatter[] = [
  {
    layer: 'seagrass_02',
    density: 0.7,
    waterDepth: [
      { from: 0.0, to: 0.4 },
      { from: 4, to: 3.5 },
    ],
    noise: { scale: 16, seedSalt: 149, band: { from: 0.35, to: 0.55 } },
  },
  {
    layer: 'pondweed_01',
    density: 0.5,
    waterDepth: [
      { from: 0.1, to: 0.3 },
      { from: 3.5, to: 2.8 },
    ],
    noise: { scale: 9, seedSalt: 137, band: { from: 0.4, to: 0.6 } },
  },
];

// Rock showing through the sand in patches, over about `share` of the bed.
function rockySand(sand: string, rock: string, share: number) {
  return [
    { material: sand },
    {
      material: rock,
      noise: {
        scale: 60,
        seedSalt: 173,
        band: { from: 1 - share, to: 1 - share + 0.15 },
      },
    },
  ];
}

export function seagrassMeadow(sand: string): SeaBiomeParams {
  return {
    name: 'seagrass-meadow',
    layers: [{ material: sand }],
    scatter: [SEAGRASS, BED_PEBBLES],
  };
}

export function kelpForest(sand: string, rock: string): SeaBiomeParams {
  return {
    name: 'kelp-forest',
    layers: rockySand(sand, rock, 0.55),
    scatter: [...KELP, BED_PEBBLES],
  };
}

// Reef rock in patches over sand, with seagrass between. The rare outcrops are
// a narrow band of their own noise field.
export function coralReef(sand: string, rock: string): SeaBiomeParams {
  return {
    name: 'coral-reef',
    layers: rockySand(sand, rock, 0.45),
    scatter: [
      { ...SEAGRASS, density: 0.4 },
      BED_PEBBLES,
      {
        layer: 'granite_01',
        density: 0.08,
        noise: { scale: 50, seedSalt: 179, band: { from: 0.8, to: 0.9 } },
      },
    ],
  };
}

export function sandFlats(sand: string): SeaBiomeParams {
  return {
    name: 'sand-flats',
    layers: [{ material: sand }],
    scatter: [{ ...BED_PEBBLES, density: 0.05 }],
    creatures: [TUNA],
  };
}

export function openOcean(bed: string): SeaBiomeParams {
  return { name: 'open-ocean', layers: [{ material: bed }], creatures: [TUNA] };
}

export function lakeBed(silt: string, stones: string): SeaBiomeParams {
  return {
    name: 'lake-bed',
    layers: rockySand(silt, stones, 0.3),
    scatter: [...LAKE_WEED, BED_PEBBLES],
    creatures: [TROUT],
  };
}

// Kelp on cold and mild shelves, coral on warm ones. Rows follow the default
// climate's temperature bands: cold, mid, warm.
export const DEFAULT_SEA: SeaConfig = {
  handover: HANDOVER,
  zones: SEA_ZONES,
  biomes: [
    seagrassMeadow('aerial_beach_01'),
    kelpForest('aerial_beach_01', 'aerial_rocks_01'),
    coralReef('aerial_beach_01', 'aerial_rocks_01'),
    sandFlats('aerial_beach_01'),
    openOcean('aerial_beach_01'),
    lakeBed('forest_leaves_02', 'aerial_rocks_01'),
  ],
  // shallows, shelf, slope, open, lake
  cells: [
    [0, 1, 3, 4, 5],
    [0, 1, 3, 4, 5],
    [0, 2, 3, 4, 5],
  ],
};

// A warm sea throughout: coral on every shelf.
export const ARID_SEA: SeaConfig = {
  handover: HANDOVER,
  zones: SEA_ZONES,
  biomes: [
    seagrassMeadow('aerial_beach_02'),
    coralReef('aerial_beach_01', 'tiger_rock_1k'),
    sandFlats('aerial_beach_02'),
    openOcean('aerial_beach_02'),
    lakeBed('sand_01', 'tiger_rock_1k'),
  ],
  cells: [
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
  ],
};
