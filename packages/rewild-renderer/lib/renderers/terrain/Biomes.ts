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

// ── Deformations ─────────────────────────────────────────────────────────────
// A biome's shape is a *stack* of deformations, each a pure function of world
// position that returns a height contribution in meters. The stack is summed:
// the first entry is conventionally an fBm 'base' (rolling hills), and later
// entries — dunes, and whatever kinds get added here in future — layer relief on
// top of it. Height and surfacing are separate concerns: this shapes the ground,
// `layers` paints it, and neither reads the other.
//
// Every deformation is seam-free: it reads only the sample's world position, so
// adjacent chunks agree on their shared edge with no cross-chunk state. And each
// is evaluated by a plain switch on `kind` (see evalDeformation in Noise.ts),
// never a per-sample method call or allocation — that switch is what keeps the
// heightfield loop cheap. Adding a kind is a member here plus a case there.
export type Deformation = FbmDeformation | DuneDeformation;

// Fractional-Brownian-motion noise: octaves of simplex summed with falling
// amplitude (persistence) and rising frequency (lacunarity), normalised to [0,1]
// against the octave stack's own fixed maximum (continuous across chunks),
// curved, and scaled to meters. The classic rolling-hills field — every biome
// carried exactly one of these before deformations existed, which is why the
// migration from the old flat fields is a straight rename.
export interface FbmDeformation {
  kind: 'fbm';
  amplitude: number; // meters at full noise (the old heightScale)
  noiseScale: number; // horizontal feature size in world-units; bigger → broader, gentler forms
  octaves: number;
  persistence: number;
  lacunarity: number;
  curveExp: number; // exponent on normalised height; >1 flattens mids, keeps peaks (old heightCurveExp)
  // Added to the world seed to pick this field's octave offsets. Two fbm
  // deformations given the same salt sample the *same* underlying field — which
  // is how neighbouring biomes keep their large-scale relief aligned across a
  // climate transition (salt 0 everywhere reproduces the old shared-offset
  // behaviour). Give a field a different salt to decorrelate it.
  seedSalt: number;
}

// Wind-blown dunes: a wavy transverse-ridge field that fBm cannot make, because
// fBm is isotropic (no wind direction) and broadband (no crest rhythm). The
// crest lines run across `angleDeg` at roughly `wavelength` spacing, meandered by
// a low-frequency warp so they read as drifting dunes rather than a corrugated
// roof. Its contribution is non-negative, so it adds swell onto the fBm beneath.
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
  // The stack that shapes this biome's surface, summed base-first (see
  // Deformation). Separate from `layers` below, which surfaces the shape with
  // materials and never touches height.
  deformations: Deformation[];
  // The materials this biome surfaces with, base first. Climate picks the
  // biome; these pick the material *within* it — height cannot do that job,
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
  // Human-readable name for the editor's preset picker. Lives here rather than
  // in a parallel id→label table so a preset cannot be added without one.
  // Omitted ⇒ callers fall back to the preset id (see getClimatePresets).
  label?: string;
  temperature: ClimateAxis;
  moisture: ClimateAxis;
  biomes: BiomeParams[];
  cells: number[][];
}

// Biome parameter table. Rows are data — adding a biome is a table edit.
//
// Open grassland: sward everywhere, with bare trodden ground worn through it in
// patches. The path noise is coarser and narrower-banded than the forest's leaf
// litter below — worn ground should read as occasional broad clearings rather
// than an even mottle, which is what separates a plain from a forest floor when
// both are green.
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
    { material: 'grass_01_1k' },
    {
      material: 'grass_path_02_1k',
      noise: { scale: 80, seedSalt: 23, band: { from: 0.15, to: 0.92 } },
    },
  ],
};

// Wooded ground — the plain's wet counterpart. Taller and busier than PLAIN over
// a tighter feature size, so the two temperate lowlands read as different
// country rather than the same field in a different green.
//
// Two leaf litters rather than litter over soil: a forest floor is what fell on
// it, so the deep broadleaf bed is the body material and the finer litter breaks
// it up in patches. forest-ground-01 stays in the library, unused by any biome —
// it reads as a worn track, which is not what a wood underfoot looks like.
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
      noise: { scale: 50, seedSalt: 11, band: { from: 0.15, to: 0.95 } },
    },
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
    { material: 'marble_cliff_05', slope: { from: 35, to: 75 } },
    {
      material: 'snow-02',
      height: { from: 100, to: 170 },
      slope: { from: 70, to: 55 },
    },
  ],
};

// The arid answer to MOUNTAIN: different rock, and snow replaced by the thing
// that actually accumulates in a desert — sand, which drifts *up* against the
// feet of the massif rather than settling on its peaks. So its height band is
// inverted where the snow band is not.
//
// It does NOT share MOUNTAIN's silhouette parameters, and the difference is the
// point. Biome blending lerps *heights*, so a biome with no low ground of its
// own cannot grow into its neighbour — it can only be faded in, which reads as
// a massif springing out of flat desert. heightCurveExp 2.0 did exactly that:
// squaring a noise field that clusters around 0.5 crushes the whole mid-range
// flat, leaving peaks and nothing under them. At 1.45 the same field keeps its
// mids, so the massif carries its own skirts and foothills down to meet DESERT's
// dune crests, and the raised persistence puts shoulders and spurs on the body
// instead of one smooth cone wearing fine noise.
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
    // Drift sand: only low down, and only where the ground is flat enough to
    // hold it. Both bands are inverted (from > to) — coverage rises as height
    // and slope *fall*. The band reaches to DESERT's peak height on purpose, so
    // sand crosses the biome border unbroken and the foothills read as buried
    // in the dune field rather than planted beside it.
    {
      material: 'sand_01',
      height: { from: 110, to: 30 },
      slope: { from: 30, to: 12 },
    },
    // Last, so a steep face wins outright over the drift below it. Opens a
    // little lower than MOUNTAIN's cliff band — the gentler height curve means
    // fewer samples reach 35°, and bare strata on the flanks is most of what
    // stops the new foothills reading as smooth mounds.
    { material: 'cliff_side_1k', slope: { from: 30, to: 65 } },
  ],
};

// Dune country: the arid world's *relief*, and the biome that carries the climb
// from the coastal flats up to the mountain's feet.
//
// It used to be a 1 km swell 50 m tall with 72% of its amplitude in one octave —
// which is neither flat enough to read as flats nor tall enough to read as
// dunes, and near-identical to BEACH_SAND's parameters besides. The tighter
// feature size plus the higher persistence is what makes a dune field: a ~600 m
// primary swell with a ~290 m secondary crest riding it at nearly half the
// amplitude, so the ground has a rhythm at the scale you actually cross it.
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
    // Cracked crust belongs in the pans, not scattered evenly over the dunes —
    // so the inverted height band puts it in the low ground and the noise field
    // (now broad enough to read as pans rather than a mottle) breaks up its edge.
    {
      material: 'sand_01',
      height: { from: 20, to: 61 },
    },
  ],
};

// Low coastal flats — the arid world's floor, and the one biome that is allowed
// to be flat. It reads as different country from DESERT by being flat where the
// dunes have relief, which is a job it can only do if it commits: at 30 m over a
// 1.4 km swell it was merely *smaller* than the dunes, and two sands differing
// only in amplitude read as one biome with a soft spot in it.
//
// Flat in silhouette is not the same as featureless underfoot, and the octave
// stack is what separates them. Six times shorter than DESERT, but with an
// octave more over a higher lacunarity, so its finest detail is twice as fine as
// the dunes' (~32 m against ~65 m): nothing here breaks 18 m while the ground
// still hummocks at ~170 m and ripples at ~74 m — the scales you walk, not the
// scale you see across.
//
// The two beach materials are the same sand at two states of wetness, so height
// alone separates them: damp and dark in the hollows, bleached and dry on the
// rises. The band spans most of the biome's range, which puts the tide line in
// the terrain's own shape rather than on a contour ring.
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
    // Low coastal dunes: shorter wavelength and gentler slip face than DESERT's,
    // so the flats ripple into wavy sand ridges without becoming dune country.
    // Different salt/bearing from DESERT so the two sand fields don't line up
    // where the biomes meet. First-pass numbers; tune to taste.
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
    // Retuned to the shorter range — the old 3→20 band never resolved at all
    // once nothing reached 20 m, leaving the whole beach permanently damp.
    {
      material: 'aerial_beach_01',
      height: { from: 0, to: 60 },
    },
  ],
};

// Three biomes over both climate axes. Temperature splits cold (mountain) from
// warm; moisture then splits the warm half into dry (plain) and wet (forest).
// Cold ignores moisture — a wet mountain and a dry mountain are the same
// mountain — which is what sharing a biome across cells is for.
//
// This is the temperate world; the desert lives in ARID_CLIMATE, which is what
// that preset exists for. Keeping the two apart is also what leaves the default
// room inside the eight splat channels (it uses seven).
export const DEFAULT_CLIMATE: ClimateConfig = {
  label: 'Default',
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
  biomes: [PLAIN, FOREST, MOUNTAIN],
  cells: [
    // dry, wet
    [2, 2], // cold → mountain either way
    [0, 1], // warm → grassland when dry, forest when wet
  ],
};

// A world with no wet half. The axes are the default's — same scales, same
// salts, so the same seed lays the biome borders in the same places — but every
// cell resolves to something arid. "Moisture" here only ever means *less dry*,
// which is why the wet warm cell is coastal flats rather than grassland.
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
// splat map — but it still bounds what generation may produce. A biome's ceiling
// is the sum of its deformation amplitudes: every kind's contribution peaks at
// its own `amplitude` and they stack, so the sum is a safe (if loose) upper
// bound on the summed height.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    let ceiling = 0;
    for (const def of biome.deformations) ceiling += def.amplitude;
    if (ceiling > max) max = ceiling;
  }
  return max;
}

// Climate presets are game content: designed in code, never persisted. A world
// stores only which preset it uses (WorldGenConfig.climatePreset). Later eras
// ("worlds back in time") are additional entries here.
export const DEFAULT_CLIMATE_PRESET = 'default';
export const ARID_CLIMATE_PRESET = 'arid';

// Ids are persisted in saved worlds (WorldGenConfig.climatePreset), so renaming
// a key here silently re-rolls every world that used it — resolveClimatePreset
// falls back to the default rather than failing. Add, don't rename.
export const CLIMATE_PRESETS: Record<string, ClimateConfig> = {
  [DEFAULT_CLIMATE_PRESET]: DEFAULT_CLIMATE,
  [ARID_CLIMATE_PRESET]: ARID_CLIMATE,
};

// The preset picker's options, in declaration order. `label` is authored on the
// config; the id is the fallback so a preset added without one still shows.
export function getClimatePresets(): { id: string; label: string }[] {
  return Object.entries(CLIMATE_PRESETS).map(([id, climate]) => ({
    id,
    label: climate.label ?? id,
  }));
}

// Unknown ids fall back to the default preset so a world saved against a
// removed/renamed preset still loads.
export function resolveClimatePreset(id: string | undefined): ClimateConfig {
  if (id !== undefined && !CLIMATE_PRESETS[id])
    console.warn(
      `Unknown climate preset '${id}' — falling back to '${DEFAULT_CLIMATE_PRESET}'.`
    );
  return CLIMATE_PRESETS[id ?? DEFAULT_CLIMATE_PRESET] ?? DEFAULT_CLIMATE;
}
