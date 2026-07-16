import { TERRAIN_MATERIALS } from './TerrainMaterials';

// A smoothstep band over a per-sample value: `from` → 0, `to` → 1, ramping
// smoothly between. `from` > `to` is allowed and inverts the ramp, so the same
// band expresses both "fades in as the value rises" and "fades out" — which is
// how snow lets go of a steepening face.
export interface SelectorBand {
  from: number;
  to: number;
}

// One material a biome can surface with, and where it applies. A layer's
// coverage is the product of its selectors; an omitted selector is 1, so a
// layer with no selectors covers everywhere.
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
  noiseScale: 400,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2.0,
  heightCurveExp: 1.1,
  layers: [{ material: 'forest-ground-01' }],
};

// 200m peaks need broad bases: noiseScale 800 keeps typical slopes in the
// 35–55° range (400 would give spikes), and heightCurveExp 2.0 keeps most of
// the region at moderate height so full-height peaks read as landmarks.
export const MOUNTAIN: BiomeParams = {
  name: 'mountain',
  heightScale: 200,
  noiseScale: 800,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.0,
  heightCurveExp: 2.0,
  layers: [
    // Base: the low, flat ground between the faces.
    { material: 'ground-coastal-1' },
    // Rock takes the steep ground, whatever the altitude.
    { material: 'rocks-ground-01', slope: { from: 25, to: 45 } },
    // Snow settles high — but not on cliffs. The inverted slope band fades it
    // out as the face steepens, letting the rock beneath show through, which is
    // what stops peaks reading as dipped in white paint.
    {
      material: 'snow-02',
      height: { from: 120, to: 170 },
      slope: { from: 45, to: 30 },
    },
  ],
};

// Two biomes split across temperature only: cold → mountain, warm → plain.
// The moisture axis is defined but uncut until a biome needs it (e.g. a desert
// row later is a moisture cut + new cell entries, no new code).
export const DEFAULT_CLIMATE: ClimateConfig = {
  temperature: {
    scale: 3000,
    seedSalt: 7919,
    cuts: [0.5],
    blendHalfWidth: 0.05,
  },
  moisture: {
    scale: 2400,
    seedSalt: 104729,
    cuts: [],
    blendHalfWidth: 0.05,
  },
  biomes: [PLAIN, MOUNTAIN],
  cells: [
    [1], // cold → mountain
    [0], // warm → plain
  ],
};

// The splat map is a single RGBA8 texture, so it carries one weight per channel
// — four materials for the whole climate. `getClimatePalette` is that mapping.
//
// The palette is global and its identity mapping is all we need today: with two
// biomes it is exactly full and cannot overflow. A fifth material (a third
// biome, or painting wanting an arbitrary library) is what forces the move to
// per-chunk palettes — see the design doc, which also covers why differing
// palettes are *not* in themselves a seam risk, and why overflow is.
export const MAX_SPLAT_LAYERS = 4;

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

    for (const layer of biome.layers) {
      if (!TERRAIN_MATERIALS[layer.material])
        throw new Error(
          `Biome '${biome.name}' references unknown terrain material '${layer.material}'.`
        );
    }
  }

  const palette = getClimatePalette(climate);
  if (palette.length > MAX_SPLAT_LAYERS)
    throw new Error(
      `Climate needs ${palette.length} materials (${palette.join(', ')}) but the splat map holds ${MAX_SPLAT_LAYERS}.`
    );
}

// Tallest possible terrain across a climate's biomes — used to normalise
// absolute world height (meters) back to [0,1], e.g. for the colour bands.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    if (biome.heightScale > max) max = biome.heightScale;
  }
  return max;
}

export const MAX_WORLD_HEIGHT = getMaxWorldHeight(DEFAULT_CLIMATE);

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
    console.warn(`Unknown climate preset '${id}' — falling back to '${DEFAULT_CLIMATE_PRESET}'.`);
  return CLIMATE_PRESETS[id ?? DEFAULT_CLIMATE_PRESET] ?? DEFAULT_CLIMATE;
}
