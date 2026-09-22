import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { SCATTER_LAYERS } from './ScatterLayers';
import { TERRAIN_MATERIALS } from './TerrainMaterials';

// A smoothstep band over a per-sample value: `from` → 0, `to` → 1. `from` > `to`
// inverts the ramp, so one band expresses both "fades in" and "fades out".
export interface SelectorBand {
  from: number;
  to: number;
}

// A selector over a per-sample value: one band, or several whose coverages
// multiply. A pair is a plateau — one band fading in and one fading out — which
// is what a treeline is: present above the foothills and gone under the snow.
export type Selector = SelectorBand | SelectorBand[];

// Organic patches, independent of the terrain's shape — what slope and height
// cannot do, since they can only ever draw the same patch on the same shape.
// The band is against a 0..1 noise value.
export interface NoiseSelector {
  // Patch size in sample units. Divide metres by TERRAIN_METERS_PER_SAMPLE.
  scale: number;
  // Added to the world seed. Same salt and scale ⇒ the same field, which is how
  // two layers interlock across one field.
  seedSalt: number;
  band: SelectorBand;
}

// One material a biome surfaces with. Coverage is the product of its selectors;
// an omitted selector is 1. Layers composite base-first — each takes its
// coverage of what the layers above left uncovered — so layers[0] is the base
// and must be unconstrained. See resolveLayerWeights.
export interface BiomeLayer {
  material: string; // key into TERRAIN_MATERIALS
  slope?: Selector; // degrees from horizontal
  height?: Selector; // absolute world meters
  noise?: NoiseSelector; // organic patches, independent of terrain shape
}

// One scatter layer a biome grows. Same selectors as BiomeLayer, but rules do
// not composite — each is an independent density field, so none is "the base"
// and a biome may name a layer at most once.
export interface BiomeScatter {
  layer: string; // key into SCATTER_LAYERS
  // Fraction of what the layer's `footprint` allows: 1 is as tightly packed as
  // the instances fit. Relative rather than per-square-metre so it composes
  // with a paint mask's 0..1 weight.
  density: number;
  slope?: Selector; // degrees from horizontal
  height?: Selector; // absolute world meters
  noise?: NoiseSelector; // organic patches, independent of terrain shape
}

// ── Deformations ─────────────────────────────────────────────────────────────
// A biome's shape is a summed stack of these, each a pure function of world
// position returning metres. Reading only world position is what keeps them
// seam-free across chunks. Evaluated by a switch on `kind` (evalDeformation in
// Noise.ts), never a method call — adding a kind is a member here plus a case
// there.
export type Deformation =
  | FbmDeformation
  | DuneDeformation
  | RidgedDeformation
  | TerraceDeformation
  | ErodedDeformation;

// Octaves of simplex summed with falling amplitude and rising frequency — the
// rolling-hills field every biome is built on.
export interface FbmDeformation {
  kind: 'fbm';
  amplitude: number; // meters at full noise
  noiseScale: number; // horizontal feature size in world-units
  octaves: number;
  persistence: number;
  lacunarity: number;
  curveExp: number; // >1 flattens mids, keeps peaks
  // Same salt ⇒ the same underlying field, which is how neighbouring biomes
  // keep their relief aligned across a climate transition.
  seedSalt: number;
}

// Wind-blown dunes — a transverse-ridge field fBm cannot make, being isotropic
// and broadband. Non-negative, so it adds swell onto the fBm beneath.
export interface DuneDeformation {
  kind: 'dunes';
  amplitude: number; // meters, trough to crest
  wavelength: number; // world-units between crests
  angleDeg: number; // wind bearing; ridges run across it
  warp: number; // how far the crest lines meander, in wavelengths
  warpScale: number; // world-units feature size of that meander
  sharpness: number; // 0 = smooth rolling swell → 1 = steep leeward slip face
  seedSalt: number; // decorrelates the meander from every other field
}

// Ridged multifractal — `1 - |noise|` per octave, so the field peaks along the
// lines where the noise crosses zero instead of at its extremes. fBm is round
// wherever you cut it and makes rolling hills; this makes ridgelines meeting at
// sharp cols, with V-shaped valleys between, which is the shape a mountain has
// and the one fBm cannot reach at any setting.
//
// Each octave is weighted by the one above it, so the fine detail gathers along
// the ridges and leaves the flanks smooth, the way erosion leaves them.
//
// Non-negative like dunes, so it adds crags onto an fBm massif beneath rather
// than replacing it, and the two can be dialled against each other.
export interface RidgedDeformation {
  kind: 'ridged';
  amplitude: number; // meters at full ridge
  noiseScale: number; // horizontal feature size in world-units
  octaves: number;
  persistence: number;
  lacunarity: number;
  // How sharp a ridge is. 1 rounds them into whalebacks, 2 is an alpine arete,
  // 4 is a knife edge. Applied per octave, so it sharpens the detail too.
  sharpness: number;
  curveExp: number; // >1 sinks the flanks and leaves the crests
  seedSalt: number;
}

// Benched ground: an fBm field quantised into steps, which is what a stack of
// beds of differing hardness weathers into. Mesas, strata benches and the
// stepped skirts of a butte — none of which a continuous field can produce,
// because the whole point is the riser between one bench and the next.
//
// The same shape the `laminae` keys cut into a rock's face, at the scale of a
// hillside, which is what makes a bedded rock read as part of the ground it
// stands on rather than as a prop placed on it.
export interface TerraceDeformation {
  kind: 'terrace';
  amplitude: number; // meters at full noise
  noiseScale: number; // horizontal feature size in world-units
  octaves: number;
  persistence: number;
  lacunarity: number;
  // Benches over the full amplitude. 6 over 400m is a bench every 65m.
  steps: number;
  // How abrupt the riser is. 0 is an unbroken ramp and quantises nothing; 1 is
  // a vertical step from one bench to the next.
  sharpness: number;
  curveExp: number; // >1 flattens mids, keeps peaks
  seedSalt: number;
}

// fBm that remembers its own slope. Each octave carries an analytic gradient,
// the gradients accumulate, and every octave after the first is damped by how
// steep the sum already is.
//
// What that produces is the shape erosion leaves: fine detail survives on flat
// ground and on ridge crests, and is stripped from the flanks, because on a
// slope the loose material has already gone downhill. Plain fBm has the same
// roughness everywhere, which is the tell that no weather ever touched it.
//
// A pure function of position like every other kind — it needs no neighbours
// and no simulation pass, which is why it costs a case here rather than a
// change to how chunks are built.
export interface ErodedDeformation {
  kind: 'eroded';
  amplitude: number; // meters at full noise
  noiseScale: number; // horizontal feature size in world-units
  octaves: number;
  persistence: number;
  lacunarity: number;
  // How hard a slope suppresses the detail on it. 0 is plain fBm; 1 is a
  // gentle smoothing of the flanks; 4 leaves them almost bare.
  erosion: number;
  curveExp: number; // >1 flattens mids, keeps peaks
  seedSalt: number;
}

// Thermal weathering: material above the angle of repose slides downhill until
// it is under it, which is what builds a talus skirt at the foot of a cliff and
// a scree cone below a gully.
//
// Unlike a deformation this cannot be a pure function of position: a cell has
// to see its neighbours, and the result of one pass feeds the next. It is run
// over a margin the height map grows for itself, wide enough that no pass ever
// reaches the edge, which is what keeps chunks seam-free without them having to
// know about each other.
export interface Erosion {
  // Passes of sliding. Each moves material at most one sample, so this is also
  // how far talus can travel, and how wide a margin the height map grows.
  iterations: number;
  // Degrees of slope material stays put on. Dry scree sits near 34; wet soil
  // and clay hold a good deal less.
  talusDeg: number;
  // Share of the excess that moves per pass, 0..1. Lower is slower and smoother.
  strength: number;
}

export interface BiomeParams {
  name: string;
  /** Shapes the ground. Never reads `layers`, and vice versa. */
  deformations: Deformation[];
  /** Surfaces the shape, base first. */
  layers: BiomeLayer[];
  /** Thermal weathering over the shaped ground. Omitted leaves it unweathered. */
  erosion?: Erosion;
  // What grows on the shape. Omitted ⇒ bare ground.
  scatter?: BiomeScatter[];
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
  /** For the editor's preset picker. Omitted ⇒ callers fall back to the id. */
  label?: string;
  temperature: ClimateAxis;
  moisture: ClimateAxis;
  biomes: BiomeParams[];
  cells: number[][];
}

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
  // Stones in the sward, and the odd erratic standing in it.
  scatter: [
    {
      layer: 'granite_pebble_01',
      density: 0.22,
      slope: { from: 24, to: 6 },
    },
    {
      layer: 'plains_01',
      density: 0.3,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'plains_02',
      density: 0.3,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'cardinal_flower_01',
      density: 0.01,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'thistle_01',
      density: 0.03,
      slope: { from: 55, to: 25 },
      noise: { scale: 160, seedSalt: 23, band: { from: 0.95, to: 0.6 } },
    },
    {
      layer: 'granite_01',
      density: 0.07,
      noise: { scale: 220, seedSalt: 41, band: { from: 0.55, to: 0.78 } },
    },
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
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'poplar_01',
      density: 0.55,
      slope: { from: 32, to: 10 },
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'plains_01',
      density: 0.3,
      slope: { from: 55, to: 25 },
      // The stand's own field, inverted. Grass fills the glades.
      noise: { scale: 260, seedSalt: 53, band: { from: 0.8, to: 0.45 } },
    },
    {
      layer: 'fern_01',
      density: 0.85,
      slope: { from: 32, to: 10 },
      noise: { scale: 260, seedSalt: 53, band: { from: 0.3, to: 0.62 } },
    },
    {
      layer: 'fern_02',
      density: 0.85,
      slope: { from: 32, to: 10 },
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
    { layer: 'granite_pebble_01', density: 0.18, slope: { from: 30, to: 8 } },
  ],
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
      height: { from: 50, to: 200 },
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
      density: 0.1,
      height: { from: 165, to: 105 },
      slope: { from: 48, to: 22 },
    },
    {
      layer: 'granite_02',
      density: 0.1,
      height: { from: 165, to: 105 },
      slope: { from: 48, to: 22 },
    },
    {
      layer: 'granite_03',
      density: 0.2,
      height: { from: 130, to: 170 },
      slope: { from: 70, to: 55 },
    },
    // The treeline: conifers climb in from the foothills, stand thickest
    // where the snow begins, and are gone before it closes over. They hold
    // steeper ground than a broadleaf would, and the noise band breaks the
    // line into stands rather than a contour of trees.
    {
      layer: 'cypress_01',
      density: 0.01,
      height: [
        { from: 0, to: 100 },
        { from: 150, to: 110 },
      ],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'poplar_01',
      density: 0.01,
      height: [
        { from: 0, to: 100 },
        { from: 150, to: 110 },
      ],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'thistle_01',
      density: 0.09,
      height: [
        { from: 0, to: 100 },
        { from: 150, to: 110 },
      ],
      slope: { from: 42, to: 20 },
    },
    {
      layer: 'plains_01',
      density: 0.1,
      height: [
        { from: 0, to: 100 },
        { from: 150, to: 110 },
      ],
      slope: { from: 42, to: 20 },
    },
  ],
};

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
      density: 0.2,
      height: { from: 420, to: 0 },
      slope: { from: 45, to: 18 },
    },
    {
      layer: 'sandstone_02',
      density: 0.2,
      height: { from: 420, to: 0 },
      slope: { from: 45, to: 18 },
    },
    {
      layer: 'sandstone_03',
      density: 0.2,
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
      density: 0.14,
      slope: { from: 40, to: 15 },
    },
  ],
};

// Dune country: the arid world's relief, carrying the climb from the coastal
// flats up to the mountain's feet. A ~600 m primary swell with a ~290 m
// secondary crest riding it, so the ground has a rhythm at the scale you cross
// it.
export const DESERT: BiomeParams = {
  name: 'desert',
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
  name: 'beach-sand',
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
  scatter: [
    {
      layer: 'sandstone_cobbles_01',
      density: 0.12,
      height: { from: 40, to: 4 },
      noise: { scale: 180, seedSalt: 79, band: { from: 0.48, to: 0.72 } },
    },
    // The odd stack the sea left behind, on the flats above the tide.
    {
      layer: 'sandstone_04',
      density: 0.05,
      slope: { from: 40, to: 15 },
    },
  ],
};

// Temperature splits cold (mountain) from warm; moisture splits the warm half
// into dry (plain) and wet (forest). Cold ignores moisture, which is what
// sharing a biome across cells is for. Uses seven of the eight splat channels.
export const DEFAULT_CLIMATE: ClimateConfig = {
  label: 'Default',
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
  biomes: [PLAIN, FOREST, MOUNTAIN],
  cells: [
    [2], // cold → mountain
    [1], // mid  → FOREST
    [0], // warm → PLAIN
  ],
};

// A world with no wet half. Same salts as the default, so the same seed lays
// the borders in the same places; "moisture" here only means less dry.
export const ARID_CLIMATE: ClimateConfig = {
  label: 'Arid',
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
  biomes: [BEACH_SAND, DESERT, DESERT_MOUNTAIN],
  cells: [
    [2], // cold → desert mountain
    [1], // mid  → dunes
    [0], // warm → coastal flats
  ],
};

// Materials per climate, across two RGBA8 splat textures. The palette is global
// rather than per-chunk, so there is no eviction policy and no overflow seam at
// a shared edge. Per-chunk palettes are the answer if the library ever outgrows
// eight simultaneously visible materials; the shader's layerIndex indirection
// is the hook for it.
export const MAX_SPLAT_LAYERS = 8;

// Two consecutive planes (channels 0-3, then 4-7) rather than interleaved, so
// each plane uploads straight from the same buffer.
export const SPLAT_BYTES_PER_TEXEL = MAX_SPLAT_LAYERS;

// The splat map's channel i. Biome order then layer order, so adding a layer
// shifts later channels — which only matters once splat maps are persisted.
export function getClimatePalette(climate: ClimateConfig): string[] {
  const palette: string[] = [];
  for (const biome of climate.biomes) {
    for (const layer of biome.layers) {
      if (!palette.includes(layer.material)) palette.push(layer.material);
    }
  }
  return palette;
}

// Every scatter layer this climate grows, in library slot order rather than
// biome order — a paint mask's channels are library slots, so it stays readable
// when a biome's rules change. The splat channel budget is what forces
// getClimatePalette into the opposite trade.
export function getClimateScatterLayers(climate: ClimateConfig): string[] {
  const used = new Set<string>();
  for (const biome of climate.biomes)
    for (const rule of biome.scatter ?? []) used.add(rule.layer);

  return Object.keys(SCATTER_LAYERS).filter((name) => used.has(name));
}

// Run by validateClimateLayers, so a bad rule surfaces at world load rather
// than at the first scattered chunk.
export function validateBiomeScatter(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    const seen = new Set<string>();

    for (const rule of biome.scatter ?? []) {
      if (!SCATTER_LAYERS[rule.layer])
        throw new Error(
          `Biome '${biome.name}' references unknown scatter layer '${rule.layer}'.`
        );

      // Rules do not composite, so a repeat silently doubles the density.
      if (seen.has(rule.layer))
        throw new Error(
          `Biome '${biome.name}' names scatter layer '${rule.layer}' twice — a biome carries one rule per layer.`
        );
      seen.add(rule.layer);

      // Zero places nothing, which reads as broken; drop the rule instead.
      if (rule.density <= 0 || rule.density > 1)
        throw new Error(
          `Biome '${biome.name}' scatter layer '${rule.layer}' density ${rule.density} must be within (0, 1] — it is a fraction of what the layer's footprint allows.`
        );
    }
  }
}

// Fails loudly on a mis-authored table rather than rendering something subtly
// wrong. Called wherever a climate is first resolved for splat generation.
export function validateClimateLayers(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    if (!biome.layers || biome.layers.length === 0)
      throw new Error(`Biome '${biome.name}' must have at least one layer.`);

    // The base takes whatever the layers above leave uncovered, so a selector
    // on it would be silently ignored.
    const base = biome.layers[0];
    if (base.slope || base.height)
      throw new Error(
        `Biome '${biome.name}' base layer '${base.material}' must not have selectors — it covers whatever the layers above it do not.`
      );

    for (let i = 0; i < biome.layers.length; i++) {
      const layer = biome.layers[i];
      if (!TERRAIN_MATERIALS[layer.material])
        throw new Error(
          `Biome '${biome.name}' references unknown terrain material '${layer.material}'.`
        );

      // Coverage 1 everywhere buries every layer beneath at weight 0. A valid
      // splat comes out, just an unintended one, so nothing downstream can
      // catch it.
      if (i > 0 && !layer.slope && !layer.height && !layer.noise)
        throw new Error(
          `Biome '${biome.name}' layer ${i} ('${layer.material}') has no selectors, so it covers everything and buries the layers beneath it. Give it a slope, height or noise selector — or make it the base layer.`
        );
    }
  }

  const palette = getClimatePalette(climate);
  if (palette.length > MAX_SPLAT_LAYERS)
    throw new Error(
      `Climate needs ${palette.length} materials (${palette.join(
        ', '
      )}) but the splat map holds ${MAX_SPLAT_LAYERS}.`
    );

  validateBiomeScatter(climate);
}

// A loose upper bound on what generation may produce: every deformation peaks
// at its own amplitude and they stack, so a biome's ceiling is their sum.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    let ceiling = 0;
    for (const def of biome.deformations) ceiling += def.amplitude;
    if (ceiling > max) max = ceiling;
  }
  return max;
}

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
