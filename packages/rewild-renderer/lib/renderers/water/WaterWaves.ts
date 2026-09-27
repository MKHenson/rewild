import { hash01, mixHash } from 'rewild-common';
import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';
import { CASCADE_COUNT, CASCADE_SIZES, cascadeWeight } from './OceanSpectrum';

// What every water surface shares besides the ocean's textures (OceanFFT):
// where positions are measured from, the large-scale variation, the foam
// drift, the wind, the grid's LOD bands, and how strongly each palette type
// takes each cascade.

// Large-scale variation, so no two stretches of water look alike: the swell
// and the chop each get a field of two value-noise octaves, and a cascade's
// amplitude takes a blend of the two by its length. One stretch is then long
// rolling swell and the next short chop, and the chop field reaches down to
// glassy slicks. Both drift downwind so rough patches cross the water.
export const SWELL_FIELD = 0;
export const CHOP_FIELD = 1;
// Metres per cell: swell octave a, b, then chop octave a, b.
export const VARIATION_SCALES = [760, 280, 430, 150];
const VARIATION_WEIGHTS = [0.65, 0.35];
// Noise between these maps across the full range, so both ends show.
const VARIATION_CONTRAST_LOW = 0.3;
const VARIATION_CONTRAST_HIGH = 0.7;
export const VARIATION_RANGES = [
  [0.35, 1.35],
  [0.08, 1.45],
];
const VARIATION_DRIFT = 2.5; // metres a second at full wind
const VARIATION_SEED = 0x7a1e;
// The noise lattice repeats every this many cells, so the drift can wrap.
export const VARIATION_PERIOD = 256;

// Foam rides downwind at this many metres a second at full wind. Its drift
// wraps at a whole number of every foam texture tile in water.wgsl.
const FOAM_DRIFT = 1.5;
export const FOAM_DRIFT_PERIOD = 8192;

// The shader measures positions from an origin near the camera, snapped to
// this many metres, so they stay small in f32 however far the camera is from
// the world origin.
const ORIGIN_SNAP = 1024;

function latticeValue(ix: number, iy: number): number {
  let h = Math.imul(ix & (VARIATION_PERIOD - 1), 0x9e3779b1);
  h = Math.imul(h ^ (iy & (VARIATION_PERIOD - 1)), 0x85ebca6b);
  return mixHash(h) / 4294967296;
}

// Smoothly interpolated lattice noise in 0..1. water.wgsl's valueNoise is the
// same function.
function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = latticeValue(ix, iy);
  const b = latticeValue(ix + 1, iy);
  const c = latticeValue(ix, iy + 1);
  const d = latticeValue(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// Floats in the packed uniform, matching water.wgsl's Waves struct.
const ORIGIN_OFFSET = 4;
const VARIATION_OFFSET = 8;
const WIND_OFFSET = 16;
const LOD_DISTANCE_OFFSET = 20;
const LOD_SPACING_OFFSET = 28;
const GRID_OFFSET = 36;
const CASCADE_OFFSET = 40;
const CASCADE_TYPES_OFFSET = CASCADE_OFFSET + CASCADE_COUNT * 4;
export const WAVE_UNIFORM_FLOATS = CASCADE_TYPES_OFFSET + CASCADE_COUNT * 4;

/** Per frame, what the water shader takes besides the ocean textures. */
export interface WaveFrame {
  /** Mip bias on the ocean slopes: lower is sharper. */
  detailBias: number;
  /** False flattens the normals, to tell a shading artefact from a geometry
   *  one. */
  normals: boolean;
  /** Paints the raw foam coverage in grey instead of the water. */
  foamDebug: boolean;
  /** The viewer's world xz, where chunk LODs were chosen. */
  eyeX: number;
  eyeZ: number;
  /** The finest grid's spacing; see waterGridBands. */
  finestSpacing: number;
  lodDistances: ArrayLike<number>;
  lodSpacings: ArrayLike<number>;
  /** The foliage wind: direction xz, strength, clock. */
  wind: ArrayLike<number>;
  /** The wind speed in m/s the ocean spectrum was built for. */
  windSpeed: number;
}

/**
 * The wave state every chunk's water shares: the variation noise and the foam
 * drift downwind, and each palette type's weight on each cascade.
 */
export class WaterWaves {
  /** Per variation octave, its drift in lattice cells (x, z), wrapped. Starts
   *  seeded, so no two octaves sample the same stretch of lattice. */
  readonly variationOffset = new Float64Array(VARIATION_SCALES.length * 2);
  /** Metres the foam has drifted (x, z), wrapped at FOAM_DRIFT_PERIOD. */
  readonly foamOffset = new Float64Array(2);
  /** Per cascade and palette type: `cascadeTypes[c * 4 + type]`. */
  readonly cascadeTypes = new Float64Array(CASCADE_COUNT * MAX_WATER_TYPES);
  /** World xz positions are measured from. */
  originX = 0;
  originZ = 0;

  constructor() {
    for (let o = 0; o < this.variationOffset.length; o++)
      this.variationOffset[o] = hash01(VARIATION_SEED, o) * VARIATION_PERIOD;
  }

  /**
   * Advances the drifts by `deltaSeconds` under the wind: `windX`, `windZ` the
   * direction the air moves, `windiness` 0..1.
   */
  update(
    deltaSeconds: number,
    windX: number,
    windZ: number,
    windiness: number,
    palette: readonly WaterType[]
  ): void {
    const wind = Math.min(1, Math.max(0, windiness));
    const length = Math.hypot(windX, windZ);
    const wx = length > 0 ? windX / length : 1;
    const wz = length > 0 ? windZ / length : 0;

    for (let v = 0; v < VARIATION_SCALES.length; v++) {
      const cells =
        (VARIATION_DRIFT * wind * deltaSeconds) / VARIATION_SCALES[v];
      for (let axis = 0; axis < 2; axis++) {
        const o = v * 2 + axis;
        const moved = this.variationOffset[o] - (axis === 0 ? wx : wz) * cells;
        this.variationOffset[o] =
          moved - Math.floor(moved / VARIATION_PERIOD) * VARIATION_PERIOD;
      }
    }

    for (let axis = 0; axis < 2; axis++) {
      const moved =
        this.foamOffset[axis] +
        (axis === 0 ? wx : wz) * FOAM_DRIFT * wind * deltaSeconds;
      this.foamOffset[axis] =
        moved - Math.floor(moved / FOAM_DRIFT_PERIOD) * FOAM_DRIFT_PERIOD;
    }

    for (let c = 0; c < CASCADE_COUNT; c++)
      for (let t = 0; t < MAX_WATER_TYPES; t++) {
        const type = palette[t];
        this.cascadeTypes[c * MAX_WATER_TYPES + t] = type
          ? cascadeWeight(type, CASCADE_SIZES[c])
          : 0;
      }
  }

  /** Moves the origin to the snapped cell around world (x, z). */
  setOrigin(x: number, z: number): void {
    this.originX = Math.round(x / ORIGIN_SNAP) * ORIGIN_SNAP;
    this.originZ = Math.round(z / ORIGIN_SNAP) * ORIGIN_SNAP;
  }

  /** A variation field (SWELL_FIELD or CHOP_FIELD) at world (x, z): the scale
   *  on the cascades it governs. */
  variation(x: number, z: number, field: number): number {
    let n = 0;
    for (let o = 0; o < 2; o++) {
      const v = field * 2 + o;
      n +=
        VARIATION_WEIGHTS[o] *
        valueNoise(
          x / VARIATION_SCALES[v] + this.variationOffset[v * 2],
          z / VARIATION_SCALES[v] + this.variationOffset[v * 2 + 1]
        );
    }
    let t =
      (n - VARIATION_CONTRAST_LOW) /
      (VARIATION_CONTRAST_HIGH - VARIATION_CONTRAST_LOW);
    t = Math.min(1, Math.max(0, t));
    t = t * t * (3 - 2 * t);
    const [low, high] = VARIATION_RANGES[field];
    return low + (high - low) * t;
  }

  /**
   * Writes the Waves uniform: the view (detail bias, normals on, viewer from
   * the origin), the origin, the ocean's wind speed and the foam debug view,
   * the variation drift,
   * the foliage wind, the LOD bands (see waterGridBands), finest spacing and
   * foam drift, then per cascade its tile size and where the origin falls in
   * its tile, and per cascade each palette type's weight.
   */
  pack(frame: WaveFrame, out: Float32Array): void {
    out[0] = frame.detailBias;
    out[1] = frame.normals ? 1 : 0;
    out[2] = frame.eyeX - this.originX;
    out[3] = frame.eyeZ - this.originZ;
    out[ORIGIN_OFFSET] = this.originX;
    out[ORIGIN_OFFSET + 1] = this.originZ;
    out[ORIGIN_OFFSET + 2] = frame.windSpeed;
    out[ORIGIN_OFFSET + 3] = frame.foamDebug ? 1 : 0;
    for (let o = 0; o < this.variationOffset.length; o++)
      out[VARIATION_OFFSET + o] = this.variationOffset[o];
    for (let i = 0; i < 4; i++) out[WIND_OFFSET + i] = frame.wind[i];
    for (let i = 0; i < 8; i++) {
      out[LOD_DISTANCE_OFFSET + i] = frame.lodDistances[i] ?? 0;
      out[LOD_SPACING_OFFSET + i] = frame.lodSpacings[i] ?? 0;
    }
    out[GRID_OFFSET] = frame.finestSpacing;
    out[GRID_OFFSET + 1] = this.foamOffset[0];
    out[GRID_OFFSET + 2] = this.foamOffset[1];
    out[GRID_OFFSET + 3] = 0;
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const size = CASCADE_SIZES[c];
      const o = CASCADE_OFFSET + c * 4;
      // Where the origin falls in the tile, in double precision, so the shader
      // adds only small numbers.
      const x = this.originX / size;
      const z = this.originZ / size;
      out[o] = size;
      out[o + 1] = 0;
      out[o + 2] = x - Math.floor(x);
      out[o + 3] = z - Math.floor(z);
      for (let t = 0; t < MAX_WATER_TYPES; t++)
        out[CASCADE_TYPES_OFFSET + c * 4 + t] =
          this.cascadeTypes[c * MAX_WATER_TYPES + t];
    }
  }
}

/**
 * The shared GPU copy of the waves, written once a frame and bound by every
 * chunk's water pass.
 */
export class WaterWaveBuffer {
  readonly waves = new WaterWaves();
  private data = new Float32Array(WAVE_UNIFORM_FLOATS);
  private gpu: GPUBuffer | null = null;

  buffer(device: GPUDevice): GPUBuffer {
    if (!this.gpu)
      this.gpu = device.createBuffer({
        label: 'water waves',
        size: WAVE_UNIFORM_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    return this.gpu;
  }

  upload(device: GPUDevice, frame: WaveFrame): void {
    this.waves.pack(frame, this.data);
    device.queue.writeBuffer(this.buffer(device), 0, this.data);
  }

  dispose(): void {
    this.gpu?.destroy();
    this.gpu = null;
  }
}
