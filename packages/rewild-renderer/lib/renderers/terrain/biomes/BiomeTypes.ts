import type { WeatherClimateId } from '../../../atmosphere/WeatherTypes';
import type { WaterType } from '../Water';

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
// and must be unconstrained. See `layer_weights` in the Rust terrain crate.
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
  // Metres below the water surface; negative is height above it. Grows only
  // where water reaches, fading with its coverage.
  waterDepth?: Selector;
  // Metres to dry ground, up to SHORE_CAP. Grows only where water reaches.
  shore?: Selector;
  // Grows only where this palette type has weight, scaled by that weight.
  waterType?: WaterType['name'];
  // Grow under water. Otherwise a rule stops at the waterline. A rule with no
  // water condition is also thinned by the beach.
  underwater?: boolean;
}

// ── Deformations ─────────────────────────────────────────────────────────────
// A biome's shape is a summed stack of these, each a pure function of world
// position returning metres. Reading only world position is what keeps them
// seam-free across chunks. Evaluated in Rust (`deformation_height` in
// rewild-wasm's terrain crate) — adding a kind is a member here, a variant in
// the crate's config.rs and a case there.
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

// Creatures a biome spawns near the player. Each chunk plans its spawns from the
// seed, so it spawns the same creatures each time it loads. A spawn point must
// pass the biome's weight there, the rule's selectors and the creature's
// habitat.
export interface BiomeCreatures {
  creature: string; // creature template name
  density: number; // groups per hectare
  group?: [number, number]; // animals per group, inclusive. Omitted ⇒ one
  school?: [number, number]; // members of one school, inclusive. `creature` names a school template
  spread?: number; // metres from the group's home its animals spawn
  drift?: number; // m/s the group's home drifts. Omitted ⇒ it stays put
  roam?: number; // metres from where it spawned the home may drift
  settle?: [number, number]; // seconds the home rests between drifts. Needs `travel`
  travel?: [number, number]; // seconds each drift lasts. Omitted ⇒ it drifts without rest
  depth?: Selector; // metres of water from the bed to the surface; 0 when dry
  shore?: Selector; // metres to dry ground, up to SHORE_CAP; 0 when dry
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
  // What lives on it. Omitted ⇒ no creatures spawn.
  creatures?: BiomeCreatures[];
}

// A scatter rule in a sea biome. Every rule grows under water.
export type SeaScatter = Omit<BiomeScatter, 'underwater'>;

// One column of the sea's cells: a stretch of water by type, depth and shore
// distance. Its weight is the product of its selectors; where zones overlap
// they share the bed by those weights.
export interface SeaZone {
  name: string;
  // Weighted by this palette type. Omitted ⇒ any water.
  waterType?: WaterType['name'];
  depth?: Selector; // metres of water from the bed to the surface
  shore?: Selector; // metres to dry ground, up to SHORE_CAP
}

// The bed under the water. Land biomes still shape it.
export interface SeaBiomeParams {
  name: string;
  /** Surfaces the bed, base first, with the same rules as a land biome's. */
  layers: BiomeLayer[];
  scatter?: SeaScatter[];
  creatures?: BiomeCreatures[];
}

// Biomes under the water. cells[temperatureBand][zone] is an index into
// `biomes`, with the land's temperature bands. Land biome rules keep the
// waterline; across `handover` the sea biomes take the bed over from them.
export interface SeaConfig {
  handover: SelectorBand; // metres of water depth
  zones: SeaZone[];
  biomes: SeaBiomeParams[];
  cells: number[][];
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

// Land and ocean: a very low-frequency noise field over world position, in
// 0..1. Below `coast` is ocean, where the biome heights give way to a sea bed
// under the world's sea level. Widths are in field units, like
// ClimateAxis.blendHalfWidth.
export interface ContinentConfig {
  scale: number; // feature size in samples; larger than the climate axes so a coast spans many chunks
  seedSalt: number;
  coast: number; // field value at the coastline
  blendHalfWidth: number; // either side of `coast`, over which land heights give way to the sea bed
  shelfWidth: number; // from the coast to the shelf edge
  shelfDepth: number; // metres below sea level at the shelf edge
  slopeWidth: number; // from the shelf edge down to the ocean floor
  oceanDepth: number; // metres below sea level on the ocean floor
  // Added to the moisture value at the coast, fading out `coastalMoistureReach`
  // inland of it. Omitted ⇒ the coast is no wetter.
  coastalMoisture?: number;
  coastalMoistureReach?: number;
}

// Lakes: at most one per cell of a coarse grid, placed and levelled from the
// seed alone so any chunk can rebuild every lake that reaches it. Distances are
// in samples; divide metres by TERRAIN_METERS_PER_SAMPLE.
export interface LakeConfig {
  cellSize: number; // side of a lake cell
  seedSalt: number;
  chance: number; // 0..1: share of cells that try to hold a lake
  radius: SelectorBand; // shore radius, picked per lake from this range
  irregularity: number; // 0..0.5: how far the shore wanders from a circle, as a share of the radius
  bank: number; // > 1: the bank reaches this multiple of the shore radius; the rim is sampled there
  depth: SelectorBand; // metres at the centre, picked per lake from this range
  margin: number; // metres the lip stands above the level
  maxRimSlope: number; // degrees: rim height spread over the rim radius; a steeper site is rejected
  maxLagoonSlope: number; // degrees: the same for a lagoon, over its dry rim only
  // 0..1: share of candidates that fall out at sea which slide ashore to try
  // for a lagoon instead of being dropped.
  lagoonChance: number;
  lagoonRadius: SelectorBand; // shore radius of a lagoon slid ashore
  // Past the bank, as a multiple of the shore radius: where a lip raised to
  // hold the water eases back down to the ground.
  moraine: number;
  spacing: number; // shore kept between the banks of neighbouring lakes
  // Omitted ⇒ a site too steep for a lake stays dry.
  tarns?: TarnConfig;
}

// A small lake in a cirque, tried where a site is too steep for a lake. Its
// level sits part way up the rim, and a lip dams the downhill side.
export interface TarnConfig {
  radius: SelectorBand; // shore radius, in samples
  maxRimSlope: number; // degrees; steeper sites stay dry
  lipShare: number; // 0..1: how far up the rim's spread the level sits
}

// Beaches: sand where the ocean is close, by height above sea level and slope.
// Laid over the biome layers the way a layer covers the ones beneath it, and
// thins the biomes' scatter by the same amount.
export interface CoastConfig {
  sand: string; // key into TERRAIN_MATERIALS; the dry beach
  wetSand?: string; // at the waterline. Omitted ⇒ sand
  seabed?: string; // below seabedDepth. Omitted ⇒ wetSand
  beachHeight: number; // metres above sea level the beach reaches
  wetHeight: number; // metres above sea level wet sand reaches
  seabedDepth: number; // metres below sea level the sea bed starts
  blend: number; // metres over which each band hands over to the next
  slope: SelectorBand; // degrees: where sand gives way to the biome's own ground
}

// The whole climate model: two axes plus a biome lookup grid.
// cells[temperatureBand][moistureBand] is an index into `biomes`; multiple
// cells may share a biome. Adding a biome = a table row + a cut + cell entries.
export interface ClimateConfig {
  /** For the editor's preset picker. Omitted ⇒ callers fall back to the id. */
  label?: string;
  /** The world's weather profile. Omitted ⇒ temperate. */
  weather?: WeatherClimateId;
  temperature: ClimateAxis;
  moisture: ClimateAxis;
  /** Omitted ⇒ the world is all land. */
  continent?: ContinentConfig;
  /** The water map's type weights index this. Required with a continent. */
  water?: WaterType[];
  /** Omitted, or without a continent ⇒ no beaches. */
  coast?: CoastConfig;
  /** Omitted ⇒ no lakes. Needs a 'lake' water type. */
  lakes?: LakeConfig;
  biomes: BiomeParams[];
  cells: number[][];
  /** Omitted ⇒ the land biomes run down to the bed. */
  sea?: SeaConfig;
}
