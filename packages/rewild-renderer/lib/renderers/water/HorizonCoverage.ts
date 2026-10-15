import { Vector2 } from 'rewild-common';
import {
  ClimateConfig,
  MAX_SPLAT_LAYERS,
  getClimatePalette,
  getCoastMaterials,
  validateClimateLayers,
} from '../terrain/Biomes';
import {
  ClimateField,
  createClimateField,
  resolveBiomeWeights,
  sampleContinent,
} from '../terrain/ClimateField';
import {
  meanNoiseCoverage,
  resolveMeanLayerWeights,
} from '../terrain/LayerWeights';
import { TERRAIN_METERS_PER_SAMPLE } from '../terrain/MeshGenerator';
import {
  GroundSampler,
  createGroundSampler,
  sampleGround,
} from '../terrain/Noise';
import { coastWeightsAt } from '../terrain/Splat';
import { toFloat16 } from '../../utils/float16';

// What the horizon ring draws past the last chunk, sampled far coarser than any
// chunk: per texel, the ground height, the raw continent value and the weight
// of each climate palette material. The continent value is smooth, so the
// shader draws a smooth coast from a bilinear sample of it. The height is the
// generator's before erosion and lake carving, which only shape detail far finer
// than a texel. The weights follow the chunks' splat rules, read off the slope
// across a texel rather than a sample.

export const FAR_MAP_TEXELS = 128;
// Near level: follows the camera closely and reaches past the far plane. Finer
// than the wide level, since its heights shape the nearest far silhouettes.
export const NEAR_FAR_MAP_TEXELS = 256;
export const NEAR_FAR_MAP_SPAN = 16000;
// Far level: reaches far enough that past it the ring is within a pixel or two
// of the horizon line from any sensible height.
export const WIDE_FAR_MAP_SPAN = 131072;

const RAD_TO_DEG = 180 / Math.PI;

const _origin = new Vector2(0, 0);

/** A field whose samples are addressed by world position via the helpers below. */
export function createWorldClimateField(
  seed: number,
  climate: ClimateConfig
): ClimateField {
  return createClimateField(1, 1, seed, _origin, climate);
}

/**
 * The continent value at world (x, z), matching what a chunk samples there.
 * `field` must come from createWorldClimateField.
 */
export function continentAtWorld(
  field: ClimateField,
  x: number,
  z: number
): number {
  return sampleContinent(
    field,
    x / TERRAIN_METERS_PER_SAMPLE,
    -z / TERRAIN_METERS_PER_SAMPLE
  );
}

/**
 * Fills a far map of texels² over `span` metres centred on world (centreX,
 * centreZ). Texel (i, j) covers +x with i and +z with j, matching a texture
 * sampled at uv = (world - centre) / span + 0.5.
 *
 * `ground` is rg16float: the ground height in metres, then the continent value.
 * `weights` is the palette weights as two rgba8 planes laid out like a chunk's
 * splat map (generateSplatMap), channel i weighting getClimatePalette()[i].
 *
 * Built a few rows at a time, so a rebuild can be spread over frames: every
 * row's ground first, then every row's weights, which need the slope across
 * the rows either side.
 */
export class FarMapBuilder {
  readonly ground: Uint16Array;
  readonly weights: Uint8Array;
  readonly centreX: number;
  readonly centreZ: number;
  readonly span: number;
  private readonly texels: number;
  private readonly seaLevel: number;
  private readonly climate: ClimateConfig;
  private readonly field: ClimateField;
  private readonly sampler: GroundSampler;
  private readonly heights: Float32Array;
  private readonly biomeChannels: Int32Array[];
  private readonly noiseCoverage: Float64Array[];
  private readonly coastChannels: Int32Array | null;
  private readonly biomes = new Int32Array(4);
  private readonly biomeWeights = new Float64Array(4);
  private readonly layerWeights: Float64Array;
  private readonly channels = new Float64Array(MAX_SPLAT_LAYERS);
  private readonly coastWeights = new Float64Array(3);
  private row = 0;

  constructor(
    seed: number,
    climate: ClimateConfig,
    centreX: number,
    centreZ: number,
    span: number,
    texels: number = FAR_MAP_TEXELS,
    seaLevel: number = 0
  ) {
    validateClimateLayers(climate);
    this.climate = climate;
    this.centreX = centreX;
    this.centreZ = centreZ;
    this.span = span;
    this.texels = texels;
    this.seaLevel = seaLevel;
    this.field = createWorldClimateField(seed, climate);
    this.sampler = createGroundSampler(seed, climate, seaLevel);
    this.heights = new Float32Array(texels * texels);
    this.ground = new Uint16Array(texels * texels * 2);
    this.weights = new Uint8Array(texels * texels * MAX_SPLAT_LAYERS);

    const palette = getClimatePalette(climate);
    this.biomeChannels = climate.biomes.map((biome) =>
      Int32Array.from(biome.layers.map((layer) => palette.indexOf(layer.material)))
    );
    this.noiseCoverage = climate.biomes.map((biome) =>
      Float64Array.from(biome.layers.map(meanNoiseCoverage))
    );
    let maxLayers = 1;
    for (const biome of climate.biomes)
      maxLayers = Math.max(maxLayers, biome.layers.length);
    this.layerWeights = new Float64Array(maxLayers);

    const coastMaterials = getCoastMaterials(climate.coast);
    this.coastChannels =
      coastMaterials.length > 0 && climate.continent
        ? Int32Array.from(coastMaterials.map((m) => palette.indexOf(m)))
        : null;
  }

  get done(): boolean {
    return this.row >= this.texels * 2;
  }

  /** Builds up to `rows` more rows; returns whether the map is complete. */
  build(rows: number = Infinity): boolean {
    const end = Math.min(this.texels * 2, this.row + rows);
    for (; this.row < end; this.row++) {
      if (this.row < this.texels) this.buildGroundRow(this.row);
      else this.buildWeightsRow(this.row - this.texels);
    }
    return this.done;
  }

  private buildGroundRow(j: number) {
    const { texels, span, field, sampler, heights, ground } = this;
    const step = span / texels;
    const x0 = this.centreX - span / 2 + step / 2;
    const z = this.centreZ - span / 2 + step / 2 + j * step;
    const sy = -z / TERRAIN_METERS_PER_SAMPLE;
    for (let i = 0; i < texels; i++) {
      const sx = (x0 + i * step) / TERRAIN_METERS_PER_SAMPLE;
      const t = i + j * texels;
      const h = sampleGround(sampler, sx - 0.5, sy - 0.5);
      heights[t] = h;
      ground[t * 2] = toFloat16(h);
      ground[t * 2 + 1] = toFloat16(sampleContinent(field, sx, sy));
    }
  }

  private buildWeightsRow(j: number) {
    const {
      texels,
      span,
      field,
      heights,
      weights,
      climate,
      biomes,
      biomeWeights,
      layerWeights,
      channels,
      coastChannels,
      coastWeights,
    } = this;
    const step = span / texels;
    const x0 = this.centreX - span / 2 + step / 2;
    const z = this.centreZ - span / 2 + step / 2 + j * step;
    const sy = -z / TERRAIN_METERS_PER_SAMPLE;
    const planeStride = texels * texels * 4;
    const j0 = j > 0 ? j - 1 : j;
    const j1 = j < texels - 1 ? j + 1 : j;

    for (let i = 0; i < texels; i++) {
      const sx = (x0 + i * step) / TERRAIN_METERS_PER_SAMPLE;
      const t = i + j * texels;
      const h = heights[t];

      const i0 = i > 0 ? i - 1 : i;
      const i1 = i < texels - 1 ? i + 1 : i;
      const dx =
        (heights[i1 + j * texels] - heights[i0 + j * texels]) /
        ((i1 - i0) * step);
      const dz =
        (heights[i + j1 * texels] - heights[i + j0 * texels]) /
        ((j1 - j0) * step);
      const slope = Math.atan(Math.sqrt(dx * dx + dz * dz)) * RAD_TO_DEG;

      channels.fill(0);
      const count = resolveBiomeWeights(field, sx, sy, biomes, biomeWeights);
      for (let b = 0; b < count; b++) {
        const biomeIndex = biomes[b];
        const biome = climate.biomes[biomeIndex];
        resolveMeanLayerWeights(
          biome,
          h,
          slope,
          this.noiseCoverage[biomeIndex],
          layerWeights
        );
        const layerChannels = this.biomeChannels[biomeIndex];
        for (let l = 0; l < biome.layers.length; l++)
          channels[layerChannels[l]] += biomeWeights[b] * layerWeights[l];
      }

      if (coastChannels) {
        const beach = coastWeightsAt(
          field,
          h - this.seaLevel,
          slope,
          sx,
          sy,
          coastWeights
        );
        if (beach > 0) {
          const keep = 1 - beach;
          for (let c = 0; c < MAX_SPLAT_LAYERS; c++) channels[c] *= keep;
          channels[coastChannels[0]] += coastWeights[0];
          channels[coastChannels[1]] += coastWeights[1];
          channels[coastChannels[2]] += coastWeights[2];
        }
      }

      const base = t * 4;
      for (let c = 0; c < 4; c++) {
        weights[base + c] = Math.round(channels[c] * 255);
        weights[planeStride + base + c] = Math.round(channels[c + 4] * 255);
      }
    }
  }
}
