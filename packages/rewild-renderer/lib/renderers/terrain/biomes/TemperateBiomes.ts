import type { BiomeParams } from './BiomeTypes';
import { LAKE_WEED, REEDS, SEABED, TUNA } from './SharedRules';

// Biome parameter table. Rows are data — adding a biome is a table edit.
//
// Open grassland: sward everywhere, worn through to bare ground in broad
// clearings.
export const PLAIN: BiomeParams = {
  name: 'plain',
  deformations: [
    {
      kind: 'fbm',
      amplitude: 20,
      noiseScale: 200,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2.0,
      curveExp: 1.1,
      seedSalt: 0,
    },
  ],
  layers: [
    { material: 'aerial_grass_rock' },
    {
      material: 'grass_path_02_1k',
      noise: { scale: 160, seedSalt: 23, band: { from: 0.15, to: 0.92 } },
    },
  ],
  // Stones in the sward, down the beach and onto the sea bed, and the odd
  // erratic standing in the sward.
  scatter: [
    {
      layer: 'granite_pebble_01',
      density: 0.22,
      slope: { from: 24, to: 6 },
      underwater: true,
    },
    REEDS,
    ...LAKE_WEED,
    ...SEABED,
    {
      layer: 'plains_01',
      density: 0.7,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'plains_02',
      density: 0.7,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'cardinal_flower_01',
      density: 0.02,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'thistle_01',
      density: 0.1,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'granite_01',
      density: 0.07,
      noise: { scale: 220, seedSalt: 41, band: { from: 0.55, to: 0.78 } },
      underwater: true,
    },
  ],
  // Flocks of hens in the sward.
  creatures: [
    { creature: 'chicken', density: 0.3, group: [2, 5], spread: 5 },
    TUNA,
  ],
};

// Wooded ground — the plain's wet counterpart, taller and busier over a tighter
// feature size. Two leaf litters rather than litter over soil: a forest floor
// is what fell on it.
export const FOREST: BiomeParams = {
  name: 'forest',
  deformations: [
    {
      kind: 'fbm',
      amplitude: 45,
      noiseScale: 260,
      octaves: 5,
      persistence: 0.45,
      lacunarity: 2.2,
      curveExp: 1.2,
      seedSalt: 0,
    },
  ],
  layers: [
    { material: 'forest_leaves_02' },
    {
      material: 'forest_leaves_03_1k',
      height: { from: 10, to: 20 },
      noise: { scale: 200, seedSalt: 11, band: { from: 0.15, to: 0.95 } },
    },
  ],
  // Thins on anything steep; the noise band breaks the stand into glades.
  scatter: [
    {
      layer: 'oak_01',
      density: 0.55,
      slope: { from: 32, to: 10 },
      height: [{ from: 100, to: 50 }],
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'poplar_01',
      density: 0.55,
      slope: { from: 32, to: 10 },
      height: [{ from: 100, to: 50 }],
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'plains_01',
      density: 0.7,
      slope: { from: 55, to: 25 },
      height: [{ from: 100, to: 50 }],
      // The stand's own field, inverted. Grass fills the glades.
      noise: { scale: 260, seedSalt: 53, band: { from: 0.8, to: 0.45 } },
    },
    {
      layer: 'fern_01',
      density: 0.85,
      slope: { from: 32, to: 10 },
      height: [{ from: 100, to: 50 }],
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'fern_02',
      density: 0.85,
      slope: { from: 32, to: 10 },
      height: [{ from: 100, to: 50 }],
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'cypress_01',
      density: 0.1,
      height: [
        { from: 20, to: 100 },
        { from: 150, to: 110 },
      ],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'granite_pebble_01',
      density: 0.18,
      slope: { from: 30, to: 8 },
      underwater: true,
    },
    REEDS,
    ...LAKE_WEED,
    ...SEABED,
  ],
  creatures: [{ creature: 'crow', density: 0.1, group: [1, 3] }, TUNA],
};

export const MOUNTAIN: BiomeParams = {
  name: 'mountain',
  // The massif, then the crags on it. The fbm carries the bulk and the ridged
  // field cuts the ridgelines and cols into it: fBm is round wherever it is
  // cut, so on its own it can only ever make a smooth dome however many
  // octaves it is given. Its persistence was 0.35, which left octaves four to
  // six contributing four, one and a half of one percent — six declared and
  // effectively two heard. Raised, with the amplitude taken out of it and
  // given to the ridges instead, so the massif is no taller than it was.
  deformations: [
    {
      kind: 'terrace',
      amplitude: 300,
      // Broader than MOUNTAIN: a wider massif spreads its rise over more
      // ground, so the climb starts well before the climate border, not at it.
      noiseScale: 750,
      octaves: 6,
      persistence: 0.42,
      lacunarity: 2.2,
      steps: 7,
      sharpness: 0.7,
      curveExp: 1.45,
      seedSalt: 0,
    },
    // Eroded rather than plain fbm: the flanks lose their fine detail and the
    // crests keep it, which is where the loose material of a real slope has
    // and has not gone.
    {
      kind: 'eroded',
      amplitude: 240,
      noiseScale: 600,
      octaves: 6,
      persistence: 0.45,
      lacunarity: 2.6,
      // Gentle. The flanks lose their fine detail and the crests keep it, and
      // ground steeper than 30 degrees only falls from 32% to 28%. Higher
      // smooths the massif back toward the dome it used to be: 10 takes it to
      // 20%, which is most of the way.
      erosion: 2,
      curveExp: 2.0,
      seedSalt: 0,
    },
    // Its own salt, so the ridgelines are not forever pinned to the same
    // features of the field beneath them. 90m against the fbm's 240 is the
    // split that holds the massif's old height envelope — median 72m against
    // 69m, peaks 192m against 212m — so the snow line and every height-banded
    // rock below still land where they were tuned to.
    {
      kind: 'ridged',
      amplitude: 90,
      noiseScale: 520,
      octaves: 5,
      persistence: 0.5,
      lacunarity: 2.3,
      sharpness: 2,
      curveExp: 1.3,
      seedSalt: 61,
    },
  ],
  // Talus under the crags. 40 degrees is steeper than dry scree sits at, on
  // purpose: most of this massif is bedrock, which holds angles no loose
  // material would, and only what has already broken off it slides. Eight
  // passes trims the worst faces from 57 degrees to 51 and half again as much
  // ground comes to rest at the repose angle, while the share steeper than 30
  // degrees does not move at all — the crags keep their shape and gain skirts.
  erosion: { iterations: 8, talusDeg: 40, strength: 0.5 },
  layers: [
    { material: 'aerial_rocks_01' },
    { material: 'marble_cliff_05', slope: { from: 15, to: 75 } },
    // Snow lies in drifts, not as a sheet. Three things break it up: it sheds
    // off anything steeper than about 55 degrees, it thins into a noise field
    // so bare rock shows through in patches, and its line climbs over a
    // hundred metres rather than arriving on a contour. Wherever its coverage
    // falls short the rock and the cliff beneath show, which is the whole
    // reason no fourth material is needed here.
    {
      material: 'snow_field_aerial',
      height: { from: 150, to: 200 },
      slope: { from: 75, to: 32 },
    },
  ],
  // Scree and erratics on the flanks, and the same cobbles again under snow
  // higher up. Every bare layer fades out *under* the snow line and the
  // snowed one fades in across it, so the stones thin into the white rather
  // than stopping on a contour, and no bare cobble sits in the snowfield.
  scatter: [
    // Loose fragments hold steeper ground than a rounded cobble does.
    {
      layer: 'granite_scree_01',
      density: 0.3,
      height: { from: 160, to: 100 },
      slope: { from: 70, to: 45 },
    },
    {
      layer: 'granite_pebble_01',
      density: 0.45,
      height: { from: 150, to: 95 },
      slope: { from: 55, to: 30 },
    },
    // The same cobbles under snow, fading in across the line the bare ones
    // fade out under, and holding all the way up. Only ground gentle enough
    // to keep snow gets them, which is the band the snow material uses.
    {
      layer: 'granite_pebble_snow_01',
      density: 0.4,
      height: { from: 100, to: 145 },
      slope: { from: 65, to: 30 },
    },
    {
      layer: 'granite_01',
      density: 0.05,
      height: { from: 165, to: 105 },
      slope: { from: 48, to: 22 },
    },
    {
      layer: 'granite_02',
      density: 0.05,
      height: { from: 165, to: 105 },
      slope: { from: 48, to: 22 },
    },
    {
      layer: 'granite_03',
      density: 0.15,
      height: { from: 150, to: 170 },
      slope: { from: 40, to: 35 },
    },
    {
      layer: 'basalt_01',
      density: 0.02,
      height: { from: 0, to: 50 },
      slope: { from: 20, to: 0 },
    },
    // The treeline: conifers climb in from the foothills, stand thickest
    // where the snow begins, and are gone before it closes over. They hold
    // steeper ground than a broadleaf would, and the noise band breaks the
    // line into stands rather than a contour of trees.
    {
      layer: 'cypress_01',
      density: 0.005,
      height: [{ from: 100, to: 50 }],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'spruce_01',
      density: 0.15,
      height: [{ from: 180, to: 150 }],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'heather_01',
      density: 0.2,
      height: [{ from: 120, to: 80 }],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'thistle_01',
      density: 0.09,
      height: [{ from: 80, to: 50 }],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'plains_01',
      density: 0.7,
      height: [{ from: 80, to: 50 }],
      slope: { from: 42, to: 20 },
    },
    ...SEABED,
  ],
  creatures: [{ creature: 'crow', density: 0.05, group: [1, 2] }, TUNA],
};
