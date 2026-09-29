import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';
import { CASCADE_COUNT, CASCADE_SIZES, cascadeWeight } from './OceanSpectrum';
import { SHORE_OMEGAS, shorePhase } from './ShoreWaves';

// What every water surface shares besides the ocean's textures (OceanFFT):
// where positions are measured from, the grid's LOD bands, and how strongly
// each palette type takes each cascade.

// The shader measures positions from an origin near the camera, snapped to
// this many metres, so they stay small in f32 however far the camera is from
// the world origin.
const ORIGIN_SNAP = 1024;

// Floats in the packed uniform, matching water.wgsl's Waves struct.
const ORIGIN_OFFSET = 4;
const LOD_DISTANCE_OFFSET = 8;
const LOD_SPACING_OFFSET = 16;
const GRID_OFFSET = 24;
const CASCADE_OFFSET = 28;
const CASCADE_TYPES_OFFSET = CASCADE_OFFSET + CASCADE_COUNT * 4;
const SHORE_OFFSET = CASCADE_TYPES_OFFSET + CASCADE_COUNT * 4;
const SWASH_OFFSET = SHORE_OFFSET + 8;
export const WAVE_UNIFORM_FLOATS = SWASH_OFFSET + 4;

/** Per frame, what the water shader takes besides the ocean textures. */
export interface WaveFrame {
  /** Mip bias on the ocean slopes: lower is sharper. */
  detailBias: number;
  /** False flattens the normals, to tell a shading artefact from a geometry
   *  one. */
  normals: boolean;
  /** Paints the raw foam coverage in grey instead of the water. */
  foamDebug: boolean;
  /** Paints the shore field instead of the water (water.wgsl shoreDebug). */
  shoreDebug: boolean;
  /** Strength of the sunlight through the wave crests; 1 is the default. */
  crestGlow: number;
  /** Strength of the trough darkening; 1 is the default. */
  troughDarkening: number;
  /** The viewer's world xz, where chunk LODs were chosen. */
  eyeX: number;
  eyeZ: number;
  /** The finest grid's spacing; see waterGridBands. */
  finestSpacing: number;
  lodDistances: ArrayLike<number>;
  lodSpacings: ArrayLike<number>;
  /** The wind speed in m/s the ocean spectrum was built for. */
  windSpeed: number;
  /** Per cascade, the RMS height in metres of the sea it holds. */
  cascadeRms: ArrayLike<number>;
  /** Seconds on the ocean's looping clock. */
  time: number;
  /** Metres: how high the shore waves break (shoreWaveHeight). */
  shoreHeight: number;
  /** World xz of the shore field's centre, and metres it spans. */
  shoreCentreX: number;
  shoreCentreZ: number;
  shoreSpan: number;
  /** Scale on the swash's runup; 1 is the default. */
  swash: number;
  /** Strength of the terrain's wet band; 1 is the default. */
  wetBand: number;
}

/**
 * The wave state every chunk's water shares: the origin and each palette
 * type's weight on each cascade.
 */
export class WaterWaves {
  /** Per cascade and palette type: `cascadeTypes[c * 4 + type]`. */
  readonly cascadeTypes = new Float64Array(CASCADE_COUNT * MAX_WATER_TYPES);
  /** World xz positions are measured from. */
  originX = 0;
  originZ = 0;

  /** Takes each palette type's weight on each cascade. */
  update(palette: readonly WaterType[]): void {
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

  /**
   * Writes the Waves uniform: the view (detail bias, normals on, viewer from
   * the origin), the origin, the ocean's wind speed and the foam debug view,
   * the LOD bands (see waterGridBands), finest spacing, crest glow and trough darkening, then per cascade
   * its tile size, RMS height and where the origin falls in its tile, per cascade
   * each palette type's weight, then the shore trains' angular frequencies and
   * phases, their breaker height and where the shore field lies, then the
   * swash and wet band strengths.
   */
  pack(frame: WaveFrame, out: Float32Array): void {
    out[0] = frame.detailBias;
    out[1] = frame.normals ? 1 : 0;
    out[2] = frame.eyeX - this.originX;
    out[3] = frame.eyeZ - this.originZ;
    out[ORIGIN_OFFSET] = this.originX;
    out[ORIGIN_OFFSET + 1] = this.originZ;
    out[ORIGIN_OFFSET + 2] = frame.windSpeed;
    out[ORIGIN_OFFSET + 3] = frame.shoreDebug ? 2 : frame.foamDebug ? 1 : 0;
    for (let i = 0; i < 8; i++) {
      out[LOD_DISTANCE_OFFSET + i] = frame.lodDistances[i] ?? 0;
      out[LOD_SPACING_OFFSET + i] = frame.lodSpacings[i] ?? 0;
    }
    out[GRID_OFFSET] = frame.finestSpacing;
    out[GRID_OFFSET + 1] = frame.crestGlow;
    out[GRID_OFFSET + 2] = frame.troughDarkening;
    out[GRID_OFFSET + 3] = 0;
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const size = CASCADE_SIZES[c];
      const o = CASCADE_OFFSET + c * 4;
      // Where the origin falls in the tile, in double precision, so the shader
      // adds only small numbers.
      const x = this.originX / size;
      const z = this.originZ / size;
      out[o] = size;
      out[o + 1] = frame.cascadeRms[c] ?? 0;
      out[o + 2] = x - Math.floor(x);
      out[o + 3] = z - Math.floor(z);
      for (let t = 0; t < MAX_WATER_TYPES; t++)
        out[CASCADE_TYPES_OFFSET + c * 4 + t] =
          this.cascadeTypes[c * MAX_WATER_TYPES + t];
    }
    for (let i = 0; i < 2; i++) {
      out[SHORE_OFFSET + i] = SHORE_OMEGAS[i];
      out[SHORE_OFFSET + 2 + i] = shorePhase(i, frame.time);
    }
    out[SHORE_OFFSET + 4] = frame.shoreHeight;
    out[SHORE_OFFSET + 5] = frame.shoreCentreX - this.originX;
    out[SHORE_OFFSET + 6] = frame.shoreCentreZ - this.originZ;
    out[SHORE_OFFSET + 7] = frame.shoreSpan;
    out[SWASH_OFFSET] = frame.swash;
    out[SWASH_OFFSET + 1] = frame.wetBand;
    out[SWASH_OFFSET + 2] = 0;
    out[SWASH_OFFSET + 3] = 0;
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
