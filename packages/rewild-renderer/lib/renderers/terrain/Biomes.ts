import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { TERRAIN_MATERIALS } from './TerrainMaterials';

// A smoothstep band over a per-sample value: `from` → 0, `to` → 1, ramping
// smoothly between. `from` > `to` is allowed and inverts the ramp, so the same
// band expresses both "fades in as the value rises" and "fades out" — which is
// how snow lets go of a steepening face.
export interface SelectorBand {
  from: number;
  to: number;
}

// A selector over a noise field rather than over the terrain's shape.
//
// Slope and height ask what the ground is doing at a sample. This asks nothing:
// it is a smooth random field, so it scatters a material in organic patches
// wherever the layer's other selectors already allow it. That is what mixes two
// materials "naturally" — a hard job for slope/height, which can only ever draw
// the same patch on the same shape.
//
// Band values are against a 0..1 noise value, so `{ from: 0.45, to: 0.55 }` is
// a roughly even mottle with soft edges, and `{ from: 0.7, to: 0.8 }` is
// occasional patches. Inverting it (from > to) selects the *other* side of the
// same field, which is how two layers can share one field and interlock.
export interface NoiseSelector {
  // Patch size in sample units. Divide metres by TERRAIN_METERS_PER_SAMPLE.
  scale: number;
  // Added to the world seed. Decorrelates this field from the height noise, the
  // climate axes, and other layers' fields. Two layers given the same salt and
  // scale see the *same* field, which is deliberate and useful.
  seedSalt: number;
  band: SelectorBand;
}

// One material a biome can surface with, and where it applies. A layer's
// coverage is the product of its selectors; an omitted selector is 1, so a
// layer with no selectors covers everywhere — which above the base means it
// buries every layer under it. validateClimateLayers rejects that.
//
// Layers composite base-first, like painting: each layer takes its coverage of
// whatever the layers above it left uncovered, and layers[0] soaks up the
// remainder. So layers[0] is the biome's base material and must be
// unconstrained, and no layer needs an explicit "everywhere the others aren't"
// rule. See resolveLayerWeights (LayerWeights.ts).
export interface BiomeLayer {
  material: string; // key into TERRAIN_MATERIALS
  slope?: SelectorBand; // degrees from horizontal
  height?: SelectorBand; // absolute world meters
  noise?: NoiseSelector; // organic patches, independent of terrain shape
}

export interface BiomeParams {
  name: string;
  heightScale: number; // max height in meters this biome can reach
  noiseScale: number; // horizontal feature size in world-units; bigger → broader, gentler forms
  octaves: number;
  persistence: number;
  lacunarity: number;
  heightCurveExp: number; // exponent on normalised height; >1 flattens mids while keeping peaks
  // The materials this biome surfaces with, base first. Climate picks the
  // biome; these picks the material *within* it — height cannot do that job,
  // since biome height ranges overlap and terrain is tall *because* it is a
  // mountain, not a mountain because it is tall.
  layers: BiomeLayer[];
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
  noiseScale: 200,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  heightCurveExp: 1.1,
  layers: [
    { material: 'forest-ground-01' },
    {
      material: 'forest_leaves_02',
      noise: { scale: 20, seedSalt: 11, band: { from: 0.35, to: 0.65 } },
    },
  ],
};

export const MOUNTAIN: BiomeParams = {
  name: 'mountain',
  heightScale: 300,
  noiseScale: 600,
  octaves: 6,
  persistence: 0.35,
  lacunarity: 2.6,
  heightCurveExp: 2.0,
  layers: [
    { material: 'aerial_rocks_01' },
    { material: 'marble_cliff_05', slope: { from: 35, to: 75 } },
    {
      material: 'snow-02',
      height: { from: 100, to: 170 },
      slope: { from: 70, to: 55 },
    },
  ],
};

export const DESERT: BiomeParams = {
  name: 'desert',
  heightScale: 50,
  noiseScale: 520,
  octaves: 3,
  persistence: 0.3,
  lacunarity: 2.2,
  heightCurveExp: 1.0,
  layers: [
    { material: 'sand_01' },
    {
      material: 'mud_cracked_dry_03',
      noise: { scale: 20, seedSalt: 11, band: { from: 0.35, to: 0.65 } },
    },
  ],
};

// Three biomes over both climate axes. Temperature splits cold (mountain) from
// warm; moisture then splits the warm half into dry (desert) and wet (plain).
// Cold ignores moisture — a wet mountain and a dry mountain are the same
// mountain — which is what sharing a biome across cells is for.
export const DEFAULT_CLIMATE: ClimateConfig = {
  temperature: {
    scale: 3000 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 7919,
    cuts: [0.5],
    // Wider transition band: softens the biome border into a gradual blend
    // rather than a hard line, and gives the ClimateField domain warp room to
    // wander the border without compressing it into a height cliff.
    blendHalfWidth: 0.1,
  },
  moisture: {
    scale: 2400 / TERRAIN_METERS_PER_SAMPLE,
    seedSalt: 104729,
    cuts: [0.5],
    blendHalfWidth: 0.1,
  },
  biomes: [PLAIN, MOUNTAIN, DESERT],
  cells: [
    // dry, wet
    [1, 1], // cold → mountain either way
    [2, 0], // warm → desert when dry, plain when wet
  ],
};

// The splat map carries one weight per channel across *two* RGBA8 textures —
// eight materials for the whole climate. `getClimatePalette` is that mapping.
//
// Four (a single RGBA8) was exactly full at two biomes, so the desert was the
// fifth material that forced the widening. The design doc offered two ways out:
// per-chunk palettes, or eight channels via a second splat texture. This is the
// second — it keeps the palette global, which means no eviction policy, no
// per-chunk palette upload, and no chance of the overflow seam (a chunk
// dropping a material its neighbour kept at a shared edge). Per-chunk palettes
// remain the answer if the library ever outgrows eight *simultaneously visible*
// materials; the shader's layerIndex indirection is still the hook for it.
//
// The cost is one extra byte-per-texel of splat per chunk and one extra texture
// sample per fragment. The per-layer work is unchanged: the shader skips any
// channel below its weight epsilon, so unused channels cost a compare.
export const MAX_SPLAT_LAYERS = 8;

// Bytes of splat per texel: two RGBA8 textures' worth, laid out as two
// consecutive planes (all texels' channels 0-3, then all texels' 4-7) rather
// than interleaved, so each plane uploads straight from the same buffer.
export const SPLAT_BYTES_PER_TEXEL = MAX_SPLAT_LAYERS;

// Every material any biome in this climate can surface with, in a stable order:
// the splat map's channel i is palette[i]. Biome order then layer order, so
// adding a layer to an existing biome shifts later channels — which only
// matters once splat maps are persisted (painting), not while they are derived.
export function getClimatePalette(climate: ClimateConfig): string[] {
  const palette: string[] = [];
  for (const biome of climate.biomes) {
    for (const layer of biome.layers) {
      if (!palette.includes(layer.material)) palette.push(layer.material);
    }
  }
  return palette;
}

// Fails loudly on a mis-authored table rather than rendering something subtly
// wrong. Called wherever a climate is first resolved for splat generation.
export function validateClimateLayers(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    if (!biome.layers || biome.layers.length === 0)
      throw new Error(`Biome '${biome.name}' must have at least one layer.`);

    // layers[0] takes whatever the layers above it leave uncovered, so a
    // selector on it would be silently ignored — and its author would be
    // expecting it to apply.
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

      // A layer above the base with no selectors has coverage 1 everywhere, and
      // layers composite top-down taking their coverage of what is left — so it
      // takes *all* of it and every layer beneath it, base included, silently
      // resolves to weight 0. The author who wrote two materials expecting to
      // see both instead sees only the last one. Nothing downstream can detect
      // this (a valid splat comes out, just an unintended one), so it is caught
      // here. To mix materials without regard to terrain shape, give the layer
      // a `noise` selector — that is what it is for.
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
}

// Tallest possible terrain across a climate's biomes. The height-colour bands
// that used to normalise against this are gone — materials now come from the
// splat map — but it still bounds what generation may produce.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    if (biome.heightScale > max) max = biome.heightScale;
  }
  return max;
}

// Climate presets are game content: designed in code, never persisted. A world
// stores only which preset it uses (WorldGenConfig.climatePreset). Later eras
// ("worlds back in time") are additional entries here.
export const DEFAULT_CLIMATE_PRESET = 'default';

export const CLIMATE_PRESETS: Record<string, ClimateConfig> = {
  [DEFAULT_CLIMATE_PRESET]: DEFAULT_CLIMATE,
};

// Unknown ids fall back to the default preset so a world saved against a
// removed/renamed preset still loads.
export function resolveClimatePreset(id: string | undefined): ClimateConfig {
  if (id !== undefined && !CLIMATE_PRESETS[id])
    console.warn(
      `Unknown climate preset '${id}' — falling back to '${DEFAULT_CLIMATE_PRESET}'.`
    );
  return CLIMATE_PRESETS[id ?? DEFAULT_CLIMATE_PRESET] ?? DEFAULT_CLIMATE;
}
