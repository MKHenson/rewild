import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { SCATTER_LAYERS } from './ScatterLayers';
import { TERRAIN_MATERIALS } from './TerrainMaterials';

// A smoothstep band over a per-sample value: `from` → 0, `to` → 1. `from` > `to`
// inverts the ramp, so one band expresses both "fades in" and "fades out".
export interface SelectorBand {
  from: number;
  to: number;
}

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
  slope?: SelectorBand; // degrees from horizontal
  height?: SelectorBand; // absolute world meters
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
  slope?: SelectorBand; // degrees from horizontal
  height?: SelectorBand; // absolute world meters
  noise?: NoiseSelector; // organic patches, independent of terrain shape
}

// ── Deformations ─────────────────────────────────────────────────────────────
// A biome's shape is a summed stack of these, each a pure function of world
// position returning metres. Reading only world position is what keeps them
// seam-free across chunks. Evaluated by a switch on `kind` (evalDeformation in
// Noise.ts), never a method call — adding a kind is a member here plus a case
// there.
export type Deformation = FbmDeformation | DuneDeformation;

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

export interface BiomeParams {
  name: string;
  /** Shapes the ground. Never reads `layers`, and vice versa. */
  deformations: Deformation[];
  /** Surfaces the shape, base first. */
  layers: BiomeLayer[];
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
      layer: 'granite_pebble',
      density: 0.22,
      slope: { from: 24, to: 6 },
    },
    {
      layer: 'granite_boulder',
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
    { layer: 'granite_pebble', density: 0.18, slope: { from: 30, to: 8 } },
  ],
};

export const MOUNTAIN: BiomeParams = {
  name: 'mountain',
  deformations: [
    {
      kind: 'fbm',
      amplitude: 300,
      noiseScale: 600,
      octaves: 6,
      persistence: 0.35,
      lacunarity: 2.6,
      curveExp: 2.0,
      seedSalt: 0,
    },
  ],
  layers: [
    { material: 'aerial_rocks_01' },
    { material: 'marble_cliff_05', slope: { from: 15, to: 75 } },
    {
      material: 'snow_field_aerial',
      height: { from: 100, to: 170 },
      slope: { from: 70, to: 55 },
    },
  ],
  // Scree and erratics on the flanks. Both fade out *under* the snow line, so
  // the stones thin into the white rather than stopping on a contour.
  scatter: [
    { layer: 'granite_pebble', density: 0.45, slope: { from: 55, to: 30 } },
    {
      layer: 'granite_boulder',
      density: 0.3,
      height: { from: 165, to: 105 },
      slope: { from: 48, to: 22 },
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
  deformations: [
    {
      kind: 'fbm',
      amplitude: 500,
      // Broader than MOUNTAIN: a wider massif spreads its rise over more
      // ground, so the climb starts well before the climate border, not at it.
      noiseScale: 750,
      octaves: 6,
      persistence: 0.42,
      lacunarity: 2.2,
      curveExp: 1.45,
      seedSalt: 0,
    },
  ],
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
      layer: 'granite_boulder',
      density: 0.26,
      height: { from: 420, to: 90 },
      slope: { from: 45, to: 18 },
    },
    { layer: 'granite_pebble', density: 0.34, slope: { from: 50, to: 20 } },
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
      layer: 'granite_boulder',
      density: 0.05,
      height: { from: 55, to: 12 },
      noise: { scale: 340, seedSalt: 67, band: { from: 0.62, to: 0.85 } },
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
      layer: 'granite_pebble',
      density: 0.12,
      height: { from: 40, to: 4 },
      noise: { scale: 180, seedSalt: 79, band: { from: 0.48, to: 0.72 } },
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
    // Wide enough that the ClimateField domain warp can wander the border
    // without compressing it into a height cliff.
    blendHalfWidth: 0.1,
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
