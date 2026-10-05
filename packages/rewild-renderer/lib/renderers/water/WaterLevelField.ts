import { toFloat16, fromFloat16 } from '../../utils/float16';
import { TERRAIN_METERS_PER_SAMPLE } from '../terrain/MeshGenerator';
import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';
import { WATER_MAP_STEP, WaterMap } from '../terrain/WaterMap';
import { blendWaterOptics } from './UnderWater';

// The water around the camera, for what lies under it but has no water map of
// its own: the level, coverage and extinction of each water map texel over a
// grid that follows the camera. Materials read it where they shade
// (water-light.wgsl), so each is dimmed by the water above it, not by the
// water under the camera.
//
// The grid's texels are the water maps' own, so filtering it is filtering
// them. It is rebuilt over several frames when the camera strays RECENTRE
// metres from its centre, and every REFRESH seconds after `invalidate` as
// ground loads or water changes.

/** Texels per side. */
export const WATER_LEVEL_TEXELS = 256;
/** Metres per texel: a water map texel's. */
export const WATER_LEVEL_TEXEL = TERRAIN_METERS_PER_SAMPLE * WATER_MAP_STEP;

const RECENTRE = 128;
const REFRESH = 1;
const ROWS_PER_FRAME = 32;

/**
 * Fills rows y0..y1-1 of a grid of `size` texels a side whose texel (0, 0) is
 * world water texel (i0, j0): per texel, the world level and 0..1 coverage
 * into `levels` (rg), and the extinction per metre into `optics` (rgba f16
 * bits). `chunkTexels` is the water map texels a chunk spans; `waterMapAt`
 * gives a chunk's map, or null where it has none. Dry texels hold zero.
 */
export function fillWaterLevels(
  waterMapAt: (cx: number, cy: number) => WaterMap | null,
  chunkTexels: number,
  palette: readonly WaterType[],
  i0: number,
  j0: number,
  size: number,
  y0: number,
  y1: number,
  levels: Float32Array,
  optics: Uint16Array,
  weights: Float64Array,
  extinction: Float64Array,
  inScatter: Float64Array
): void {
  const half = chunkTexels / 2;
  let lastCx = NaN;
  let lastCy = NaN;
  let water: WaterMap | null = null;
  for (let y = y0; y < y1; y++) {
    const j = j0 + y;
    const cy = Math.round(j / chunkTexels);
    for (let x = 0; x < size; x++) {
      const g = x + y * size;
      levels[g * 2] = 0;
      levels[g * 2 + 1] = 0;
      optics.fill(0, g * 4, g * 4 + 4);
      const i = i0 + x;
      const cx = Math.round(i / chunkTexels);
      if (cx !== lastCx || cy !== lastCy) {
        lastCx = cx;
        lastCy = cy;
        water = waterMapAt(cx, cy);
      }
      if (!water) continue;
      const t =
        (cy * chunkTexels + half - j) * water.size +
        (i - cx * chunkTexels + half);
      const coverage = water.coverage[t];
      if (coverage === 0) continue;
      levels[g * 2] = water.baseLevel + fromFloat16(water.level[t]);
      levels[g * 2 + 1] = coverage / 255;
      let total = 0;
      for (let c = 0; c < MAX_WATER_TYPES; c++) {
        weights[c] = water.typeWeights[t * 4 + c];
        total += weights[c];
      }
      if (total <= 0) {
        weights.fill(0);
        weights[0] = 1;
      } else for (let c = 0; c < MAX_WATER_TYPES; c++) weights[c] /= total;
      blendWaterOptics(palette, weights, extinction, inScatter);
      for (let c = 0; c < 3; c++) optics[g * 4 + c] = toFloat16(extinction[c]);
    }
  }
}

export class WaterLevelField {
  /** World xz of texel (0, 0)'s centre in the uploaded grid. */
  originX = 0;
  originZ = 0;
  /** Whether a grid has been uploaded. */
  built = false;

  private levelTexture: GPUTexture | null = null;
  private opticsTexture: GPUTexture | null = null;
  private levels = new Float32Array(
    WATER_LEVEL_TEXELS * WATER_LEVEL_TEXELS * 2
  );
  private optics = new Uint16Array(WATER_LEVEL_TEXELS * WATER_LEVEL_TEXELS * 4);
  private weights = new Float64Array(MAX_WATER_TYPES);
  private extinction = new Float64Array(3);
  private inScatter = new Float64Array(3);
  private centreX = 0;
  private centreZ = 0;
  private buildX = 0;
  private buildZ = 0;
  // Next row to fill, or -1 when no rebuild is under way.
  private row = -1;
  private dirty = true;
  private age = Infinity;

  /** Level and coverage per texel (rg32float). */
  levelMap(device: GPUDevice): GPUTexture {
    this.levelTexture ??= device.createTexture({
      label: 'water levels',
      size: [WATER_LEVEL_TEXELS, WATER_LEVEL_TEXELS],
      format: 'rg32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    return this.levelTexture;
  }

  /** Extinction per metre per texel (rgba16float). */
  opticsMap(device: GPUDevice): GPUTexture {
    this.opticsTexture ??= device.createTexture({
      label: 'water optics',
      size: [WATER_LEVEL_TEXELS, WATER_LEVEL_TEXELS],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    return this.opticsTexture;
  }

  /** The water changed: rebuild once REFRESH has passed. */
  invalidate(): void {
    this.dirty = true;
  }

  update(
    device: GPUDevice,
    deltaSeconds: number,
    eyeX: number,
    eyeZ: number,
    chunkTexels: number,
    waterMapAt: (cx: number, cy: number) => WaterMap | null,
    palette: readonly WaterType[]
  ): void {
    if (!chunkTexels) return;
    this.age += deltaSeconds;
    if (this.row < 0) {
      const strayed =
        Math.max(Math.abs(eyeX - this.centreX), Math.abs(eyeZ - this.centreZ)) >
        RECENTRE;
      const stale = this.dirty && this.age >= REFRESH;
      if (this.built && !strayed && !stale) return;
      this.buildX = Math.round(eyeX / RECENTRE) * RECENTRE;
      this.buildZ = Math.round(eyeZ / RECENTRE) * RECENTRE;
      this.row = 0;
      this.dirty = false;
      this.age = 0;
    }

    const size = WATER_LEVEL_TEXELS;
    const i0 = Math.round(this.buildX / WATER_LEVEL_TEXEL) - size / 2;
    const j0 = Math.round(this.buildZ / WATER_LEVEL_TEXEL) - size / 2;
    const end = Math.min(size, this.row + ROWS_PER_FRAME);
    fillWaterLevels(
      waterMapAt,
      chunkTexels,
      palette,
      i0,
      j0,
      size,
      this.row,
      end,
      this.levels,
      this.optics,
      this.weights,
      this.extinction,
      this.inScatter
    );
    this.row = end;
    if (this.row < size) return;

    device.queue.writeTexture(
      { texture: this.levelMap(device) },
      this.levels as BufferSource,
      { bytesPerRow: size * 8 },
      { width: size, height: size }
    );
    device.queue.writeTexture(
      { texture: this.opticsMap(device) },
      this.optics as BufferSource,
      { bytesPerRow: size * 8 },
      { width: size, height: size }
    );
    this.originX = i0 * WATER_LEVEL_TEXEL;
    this.originZ = j0 * WATER_LEVEL_TEXEL;
    this.centreX = this.buildX;
    this.centreZ = this.buildZ;
    this.built = true;
    this.row = -1;
  }
}
