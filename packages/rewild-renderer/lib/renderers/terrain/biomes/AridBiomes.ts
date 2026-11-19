import type { BiomeParams } from './BiomeTypes';
import { LAKE_WEED, SEABED } from './SharedRules';

// The arid answer to MOUNTAIN: different rock, and sand drifting *up* against
// the massif's feet where snow settles on peaks — hence the inverted band.
//
// Its silhouette deliberately differs from MOUNTAIN's. Biome blending lerps
// heights, so a biome with no low ground of its own can only be faded in, which
// reads as a massif springing out of flat desert; the gentler curveExp keeps
// the mids that carry its skirts down to meet DESERT.
export const DESERT_MOUNTAIN: BiomeParams = {
  name: 'desert-mountain',
  // The same massif this biome always had, cut into benches. Salt, scale,
  // octaves and curve are the ones the fbm carried, so the envelope is
  // unchanged and only the risers are new: sandstone weathers bed by bed, and
  // a bench is what a hard bed leaves when the soft one under it goes. It is
  // the shape the `laminae` keys cut into a rock's face, at the scale of the
  // hillside the rock stands on.
  deformations: [
    {
      kind: 'terrace',
      amplitude: 500,
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
    // A little roughness over the top, or every bench edge is a clean contour
    // line and the massif reads as a relief map.
    {
      kind: 'fbm',
      amplitude: 55,
      noiseScale: 190,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2.4,
      curveExp: 1,
      seedSalt: 91,
    },
  ],
  // Debris skirts at the foot of the risers. The risers themselves stand near
  // vertical, far past any angle loose material rests at, so weathering never
  // touches them: it takes what has already fallen and piles it below, which is
  // what the apron of rubble under a real mesa is.
  erosion: { iterations: 8, talusDeg: 42, strength: 0.4 },
  layers: [
    { material: 'tiger_rock_1k' },
    // Drift sand: low down, and flat enough to hold it — both bands inverted.
    // Reaches DESERT's peak height so sand crosses the border unbroken.
    {
      material: 'sand_01',
      height: { from: 310, to: 60 },
      slope: { from: 30, to: 12 },
    },
    // Last, so a steep face wins outright over the drift below it.
    { material: 'cliff_side_1k', slope: { from: 30, to: 65 } },
  ],
  // Weathered blocks, collecting on the flanks and skirts rather than the crest.
  scatter: [
    {
      layer: 'sandstone_01',
      density: 0.05,
      height: { from: 420, to: 0 },
      slope: { from: 45, to: 18 },
    },
    {
      layer: 'sandstone_02',
      density: 0.05,
      height: { from: 420, to: 0 },
      slope: { from: 45, to: 18 },
    },
    {
      layer: 'sandstone_03',
      density: 0.05,
      height: { from: 420, to: 0 },
      slope: { from: 0, to: 18 },
    },
    {
      layer: 'sandstone_cobbles_01',
      density: 0.34,
      slope: { from: 50, to: 20 },
    },
    {
      layer: 'sandstone_04',
      density: 0.05,
      slope: { from: 40, to: 15 },
    },
    ...SEABED,
  ],
};

// Dune country: the arid world's relief, carrying the climb from the coastal
// flats up to the mountain's feet. A ~600 m primary swell with a ~290 m
// secondary crest riding it, so the ground has a rhythm at the scale you cross
// it.
export const DESERT: BiomeParams = {
  name: 'palm-forest',
  deformations: [
    {
      kind: 'fbm',
      amplitude: 110,
      noiseScale: 300,
      octaves: 4,
      persistence: 0.45,
      lacunarity: 2.1,
      curveExp: 1.25, // hollows the pans between crests without blunting them
      seedSalt: 0,
    },
  ],
  layers: [
    { material: 'mud_cracked_dry_03' },
    // Cracked crust belongs in the pans, so the band puts it in the low ground.
    {
      material: 'sand_01',
      height: { from: 20, to: 61 },
    },
  ],
  // Almost bare: a dune crest is moving sand, so the inverted height band puts
  // what little there is down in the pans.
  scatter: [
    {
      layer: 'palm_01',
      density: 0.35,
      slope: { from: 32, to: 10 },
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'palm_03',
      density: 0.25,
      slope: { from: 32, to: 10 },
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'palm_02',
      density: 0.35,
      slope: { from: 32, to: 10 },
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'desert_plains_01',
      density: 0.3,
      slope: { from: 55, to: 25 },
      // The stand's own field, inverted. Grass fills the glades.
      noise: { scale: 260, seedSalt: 53, band: { from: 0.8, to: 0.45 } },
    },
    {
      layer: 'palm_04',
      density: 0.3,
      slope: { from: 55, to: 25 },
      // The stand's own field, inverted. Grass fills the glades.
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'sandstone_01',
      density: 0.05,
      height: { from: 55, to: 12 },
      noise: { scale: 340, seedSalt: 67, band: { from: 0.62, to: 0.85 } },
    },
    {
      layer: 'sandstone_cobbles_01',
      density: 0.18,
      slope: { from: 30, to: 8 },
    },
    // Sparse on the flats, where the dunes leave anything standing.
    {
      layer: 'sandstone_04',
      density: 0.04,
      slope: { from: 40, to: 15 },
    },
    ...SEABED,
    ...LAKE_WEED,
  ],
  // A pride that wanders the palms together.
  creatures: [
    {
      creature: 'lioness',
      density: 0.03,
      group: [3, 5],
      spread: 8,
      drift: 0.4,
      roam: 60,
    },
  ],
};

// Low coastal flats — the arid world's floor, and the one biome allowed to be
// flat. Flat in silhouette is not featureless underfoot: the octave stack keeps
// detail at the scales you walk (~170 m hummocks, ~74 m ripples) while nothing
// breaks 18 m.
//
// The two beach materials are one sand at two wetnesses, so height alone splits
// them — which puts the tide line in the terrain's own shape, not on a contour.
export const BEACH_SAND: BiomeParams = {
  name: 'dunes',
  deformations: [
    {
      kind: 'fbm',
      amplitude: 100,
      noiseScale: 550,
      octaves: 3,
      persistence: 0.42,
      lacunarity: 2.3,
      curveExp: 1.3, // keeps the flats flat; only the rare rise gets height
      seedSalt: 0,
    },
    // Low coastal dunes: shorter wavelength and gentler slip face than DESERT's.
    // Different salt and bearing so the two sand fields don't line up at the
    // border.
    {
      kind: 'dunes',
      amplitude: 10,
      wavelength: 100,
      angleDeg: 55,
      warp: 0.35,
      warpScale: 200,
      sharpness: 0.45,
      seedSalt: 17,
    },
  ],
  layers: [
    { material: 'aerial_beach_02' },
    {
      material: 'aerial_beach_01',
      height: { from: 0, to: 60 },
    },
  ],
  // Shingle in the damp hollows, on the same height split the two sands use.
  scatter: [...SEABED],
};
