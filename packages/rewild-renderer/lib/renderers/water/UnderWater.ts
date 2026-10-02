import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';
import {
  PROBE_RESULT_FLOATS,
  WaterQuery,
  WaterQuerySample,
  createWaterQuerySample,
} from './WaterQuery';

// The water around the camera, for everything that draws differently under
// it: the UnderWater uniform (under-water.wgsl), and what materials need to
// dim the light under it (IblParams). The CPU reads the water map at the
// camera and asks the probe for the waves there; the probe's result is copied
// into the uniform on the GPU the same frame, so the view switches the moment
// the camera crosses the surface.

/** Floats in the UnderWater uniform. */
export const UNDER_WATER_FLOATS = 24;
/** Byte offset of `probe` in the UnderWater uniform. */
export const UNDER_WATER_PROBE_OFFSET = 16;
const EXTINCTION_OFFSET = 8;
const IN_SCATTER_OFFSET = 12;
const SUN_OFFSET = 16;
const SUN_DIRECTION_OFFSET = 20;

/** Metres above the water's level the camera can be and still have a wave
 *  over it: within it the probe decides. */
export const WAVE_REACH = 15;
/** Air over water's index of refraction. */
const AIR_TO_WATER = 0.75;
/** Share of the sun's light the surface lets in. */
const SUN_ENTERS = 0.98;

/** The cosine from straight up of the sun refracted into the water, for a sun
 *  whose cosine in the air is `sunUp`; 0 while it is down. */
export function refractedSunCosine(sunUp: number): number {
  if (sunUp <= 0) return 0;
  return Math.sqrt(1 - AIR_TO_WATER * AIR_TO_WATER * (1 - sunUp * sunUp));
}

/** The palette's extinction (absorption plus turbidity) and in-water glow
 *  for `weights`, into `extinction` and `inScatter`. */
export function blendWaterOptics(
  palette: readonly WaterType[],
  weights: ArrayLike<number>,
  extinction: Float64Array,
  inScatter: Float64Array
): void {
  extinction.fill(0);
  inScatter.fill(0);
  for (let t = 0; t < Math.min(palette.length, MAX_WATER_TYPES); t++) {
    const w = weights[t];
    if (!w) continue;
    const type = palette[t];
    for (let c = 0; c < 3; c++) {
      extinction[c] += (type.absorption[c] + type.turbidity) * w;
      inScatter[c] += type.inScatter[c] * w;
    }
  }
}

export class UnderWater {
  /** The water at the camera, read this frame. */
  readonly sample: WaterQuerySample = createWaterQuerySample();
  /** Whether the camera stands over water. Materials below its level dim
   *  their light (IblParams). */
  covered = false;
  /** Whether the camera may be under water: it stands over water, within
   *  WAVE_REACH of its level. The GPU probe decides. */
  possible = false;
  /** Whether the camera is under the surface by the probe's last readback, a
   *  few frames old. For what the CPU skips, such as rain. */
  submerged = false;
  /** Extinction per metre and in-water glow of the water at the camera. */
  readonly extinction = new Float64Array(3);
  readonly inScatter = new Float64Array(3);
  /** The cosine from straight up of the sun refracted into the water. */
  sunCosine = 0;
  private probe = -1;
  private data = new Float32Array(UNDER_WATER_FLOATS);
  private gpu: GPUBuffer | null = null;

  /** The UnderWater uniform. It outlives the terrain's chunks, so passes can
   *  bind it once. */
  buffer(device: GPUDevice): GPUBuffer {
    if (!this.gpu)
      this.gpu = device.createBuffer({
        label: 'under water',
        size: UNDER_WATER_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    return this.gpu;
  }

  /** The probe the camera uses; -1 before the first update. */
  get cameraProbe(): number {
    return this.probe;
  }

  /**
   * Reads the water at the camera (`eyeX`, `eyeY`, `eyeZ`) and writes the
   * uniform. `toSun` is the world direction toward the sun and `sunRadiance`
   * its radiance in the air, rgb. Call before the probe dispatches, so its
   * copy into the uniform lands after this write.
   */
  update(
    device: GPUDevice,
    query: WaterQuery,
    palette: readonly WaterType[],
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    toSun: ArrayLike<number>,
    sunRadiance: ArrayLike<number>
  ): void {
    if (this.probe < 0) this.probe = query.acquireProbe();
    const sample = this.sample;
    const loaded = query.sample(eyeX, eyeZ, sample, this.probe);
    const covered = loaded && sample.coverage > 0;
    this.covered = covered;
    this.possible = covered && eyeY < sample.level + WAVE_REACH;
    this.submerged = covered && eyeY < sample.surface;
    if (covered)
      blendWaterOptics(
        palette,
        sample.typeWeights,
        this.extinction,
        this.inScatter
      );

    const sunUp = toSun[1];
    const mu = refractedSunCosine(sunUp);
    this.sunCosine = mu;
    // Light through the horizontal surface, spread over the refracted beam.
    const beam = mu > 0 ? (SUN_ENTERS * sunUp) / mu : 0;

    const d = this.data;
    d[0] = this.possible ? 1 : 0;
    d[1] = eyeY;
    d[2] = covered ? sample.level : 0;
    d[3] = loaded ? sample.ground : -1e6;
    for (let c = 0; c < 3; c++) {
      d[EXTINCTION_OFFSET + c] = this.extinction[c];
      d[IN_SCATTER_OFFSET + c] = this.inScatter[c];
      d[SUN_OFFSET + c] = sunRadiance[c] * beam;
    }
    d[SUN_OFFSET + 3] = mu;
    d[SUN_DIRECTION_OFFSET] = toSun[0] * AIR_TO_WATER;
    d[SUN_DIRECTION_OFFSET + 1] = mu;
    d[SUN_DIRECTION_OFFSET + 2] = toSun[2] * AIR_TO_WATER;
    const buffer = this.buffer(device);
    // `probe` is left for the GPU copy.
    device.queue.writeBuffer(buffer, 0, d, 0, 4);
    device.queue.writeBuffer(
      buffer,
      EXTINCTION_OFFSET * 4,
      d,
      EXTINCTION_OFFSET,
      UNDER_WATER_FLOATS - EXTINCTION_OFFSET
    );
  }

  /** Marks the camera out of the water, as when the terrain is off. */
  clear(device: GPUDevice): void {
    this.covered = false;
    if (!this.possible && !this.submerged) return;
    this.possible = false;
    this.submerged = false;
    this.data[0] = 0;
    device.queue.writeBuffer(this.buffer(device), 0, this.data, 0, 4);
  }

  /** Bytes of the probe's results that hold the camera's point. */
  get probeResultOffset(): number {
    return Math.max(this.probe, 0) * PROBE_RESULT_FLOATS * 4;
  }

  /** Lets go of the camera's probe. */
  release(query: WaterQuery): void {
    query.releaseProbe(this.probe);
    this.probe = -1;
  }

  dispose(): void {
    this.gpu?.destroy();
    this.gpu = null;
  }
}
