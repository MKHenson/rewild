import { FarMapBuild } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { ClimateConfig, validateClimateLayers } from '../terrain/Biomes';
import { terrainGenerator } from '../terrain/TerrainGenerator';

// What the horizon ring draws past the last chunk, sampled far coarser than any
// chunk: per texel, the ground height, the raw continent value and the weight
// of each climate palette material. The continent value is smooth, so the
// shader draws a smooth coast from a bilinear sample of it. The height is the
// generator's before erosion and lake carving, which only shape detail far finer
// than a texel. The weights follow the chunks' splat rules, read off the slope
// across a texel rather than a sample. Built in Rust (crates/terrain/src/far.rs).

export const FAR_MAP_TEXELS = 128;
// Near level: follows the camera closely and reaches past the far plane. Finer
// than the wide level, since its heights shape the nearest far silhouettes.
export const NEAR_FAR_MAP_TEXELS = 256;
export const NEAR_FAR_MAP_SPAN = 16000;
// Far level: reaches far enough that past it the ring is within a pixel or two
// of the horizon line from any sensible height.
export const WIDE_FAR_MAP_SPAN = 131072;

/**
 * Fills a far map of texels² over `span` metres centred on world (centreX,
 * centreZ). Texel (i, j) covers +x with i and +z with j, matching a texture
 * sampled at uv = (world - centre) / span + 0.5.
 *
 * `ground` is rg16float: the ground height in metres, then the continent value.
 * `weights` is the palette weights as two rgba8 planes laid out like a chunk's
 * splat map (generateSplatMap), channel i weighting getClimatePalette()[i].
 * Both are there once `build` returns true.
 *
 * Built a few rows at a time, so a rebuild can be spread over frames: every
 * row's ground first, then every row's weights, which need the slope across
 * the rows either side.
 */
export class FarMapBuilder {
  ground: Uint16Array = new Uint16Array(0);
  weights: Uint8Array = new Uint8Array(0);
  readonly centreX: number;
  readonly centreZ: number;
  readonly span: number;
  private readonly texels: number;
  private readonly seed: number;
  private readonly climate: ClimateConfig;
  private readonly seaLevel: number;
  private map: FarMapBuild | null;

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
    this.seed = seed;
    this.climate = climate;
    this.seaLevel = seaLevel;
    this.centreX = centreX;
    this.centreZ = centreZ;
    this.span = span;
    this.texels = texels;
    this.map = new FarMapBuild(centreX, centreZ, span, texels);
  }

  get done(): boolean {
    return this.map === null;
  }

  /** Builds up to `rows` more rows; returns whether the map is complete. */
  build(rows: number = Infinity): boolean {
    const map = this.map;
    if (!map) return true;
    const generator = terrainGenerator(this.seed, this.climate, this.seaLevel);
    if (!map.build(generator, Math.min(rows, this.texels * 2))) return false;
    this.ground = map.takeGround();
    this.weights = map.takeWeights();
    map.free();
    this.map = null;
    return true;
  }
}
