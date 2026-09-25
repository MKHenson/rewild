import { Vector2 } from 'rewild-common';
import { ClimateConfig } from '../terrain/Biomes';
import {
  ClimateField,
  createClimateField,
  resolveBiomeWeights,
  sampleContinent,
} from '../terrain/ClimateField';
import { TERRAIN_METERS_PER_SAMPLE } from '../terrain/MeshGenerator';
import { toFloat16 } from '../../utils/float16';

// What the horizon ring draws past the last chunk, sampled far coarser than any
// chunk: per texel, the land's colour and the raw continent value. The value is
// smooth, so the shader draws a smooth coast from a bilinear sample of it.

export const FAR_MAP_TEXELS = 128;
// Near level: follows the camera closely and reaches past the far plane.
export const NEAR_FAR_MAP_SPAN = 16000;
// Far level: reaches far enough that past it the ring is within a pixel or two
// of the horizon line from any sensible height.
export const WIDE_FAR_MAP_SPAN = 131072;

const DEFAULT_FAR_COLOR: readonly [number, number, number] = [0.15, 0.15, 0.15];

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
 * Fills a texels² rgba16float far map over `span` metres centred on world
 * (centreX, centreZ): rgb is the land colour, a the continent value. Texel
 * (i, j) covers +x with i and +z with j, matching a texture sampled at
 * uv = (world - centre) / span + 0.5. Built a few rows at a time, so a rebuild
 * can be spread over frames.
 */
export class FarMapBuilder {
  readonly data: Uint16Array;
  readonly centreX: number;
  readonly centreZ: number;
  readonly span: number;
  private readonly texels: number;
  private readonly climate: ClimateConfig;
  private readonly field: ClimateField;
  private readonly biomes = new Int32Array(4);
  private readonly weights = new Float64Array(4);
  private row = 0;

  constructor(
    seed: number,
    climate: ClimateConfig,
    centreX: number,
    centreZ: number,
    span: number,
    texels: number = FAR_MAP_TEXELS
  ) {
    this.climate = climate;
    this.centreX = centreX;
    this.centreZ = centreZ;
    this.span = span;
    this.texels = texels;
    this.field = createWorldClimateField(seed, climate);
    this.data = new Uint16Array(texels * texels * 4);
  }

  get done(): boolean {
    return this.row >= this.texels;
  }

  /** Builds up to `rows` more rows; returns whether the map is complete. */
  build(rows: number = Infinity): boolean {
    const { texels, span, field, biomes, weights, data } = this;
    const step = span / texels;
    const x0 = this.centreX - span / 2 + step / 2;
    const z0 = this.centreZ - span / 2 + step / 2;
    const biomeParams = this.climate.biomes;
    const end = Math.min(texels, this.row + rows);

    for (let j = this.row; j < end; j++) {
      const z = z0 + j * step;
      for (let i = 0; i < texels; i++) {
        const x = x0 + i * step;
        const sx = x / TERRAIN_METERS_PER_SAMPLE;
        const sy = -z / TERRAIN_METERS_PER_SAMPLE;

        let r = 0;
        let g = 0;
        let b = 0;
        const count = resolveBiomeWeights(field, sx, sy, biomes, weights);
        for (let k = 0; k < count; k++) {
          const color = biomeParams[biomes[k]].farColor ?? DEFAULT_FAR_COLOR;
          r += color[0] * weights[k];
          g += color[1] * weights[k];
          b += color[2] * weights[k];
        }

        const t = (i + j * texels) * 4;
        data[t] = toFloat16(r);
        data[t + 1] = toFloat16(g);
        data[t + 2] = toFloat16(b);
        data[t + 3] = toFloat16(sampleContinent(field, sx, sy));
      }
    }
    this.row = end;
    return this.done;
  }
}
