import { MAX_WATER_TYPES, WaterType } from '../terrain/Water';
import type { ProbeCopy } from './WaterProbe';
import {
  PROBE_RESULT_FLOATS,
  WaterQuery,
  WaterQuerySample,
  createWaterQuerySample,
} from './WaterQuery';

// The water around the camera, for everything that draws differently under
// it: the UnderWater uniform (under-water.wgsl), and what materials need to
// dim the light under it (IblParams). The CPU reads the water map at the
// camera and asks the probe for the waves there and a step along x and z; the
// probe's results are copied into the uniform on the GPU the same frame, so
// the view switches the moment the surface crosses the lens.

/** Floats in the UnderWater uniform. */
export const UNDER_WATER_FLOATS = 52;
/** Byte offsets of the probes at the camera, a step along +x and a step
 *  along +z in the UnderWater uniform. The GPU copies them in. */
export const UNDER_WATER_PROBE_OFFSETS = [16, 32, 48] as const;
const OPTICS_OFFSET = 16;
const EXTINCTION_OFFSET = 16;
const IN_SCATTER_OFFSET = 20;
const SUN_OFFSET = 24;
const SUN_DIRECTION_OFFSET = 28;
const LENS_OFFSET = 32;
const VIEW_TO_WORLD_OFFSET = 36;

/** Metres above the water's level the camera can be and still have a wave
 *  over it: within it the probe decides. */
export const WAVE_REACH = 15;
/** Metres between the camera's probe and the two beside it, which give the
 *  surface's slope over the lens. */
export const LENS_PROBE_STEP = 0.25;
/** Metres from the surface, by the last readback, within which the surface
 *  may cross the lens. */
export const LENS_REACH = 1;
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
  /** Whether the surface may cross the lens: within LENS_REACH of the eye by
   *  the last readback. */
  nearSurface = false;
  /** Extinction per metre and in-water glow of the water at the camera. */
  readonly extinction = new Float64Array(3);
  readonly inScatter = new Float64Array(3);
  /** The cosine from straight up of the sun refracted into the water. */
  sunCosine = 0;
  /** The probe results to copy into the uniform each frame: the camera's,
   *  then the ones a step along x and z. */
  readonly probeCopies: ProbeCopy[] = UNDER_WATER_PROBE_OFFSETS.map(
    (targetOffset) => ({
      sourceOffset: 0,
      target: null as unknown as GPUBuffer,
      targetOffset,
    })
  );
  private probes = [-1, -1, -1];
  private beside = createWaterQuerySample();
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

  /**
   * Reads the water at the camera (`eyeX`, `eyeY`, `eyeZ`) and writes the
   * uniform. `toSun` is the world direction toward the sun and `sunRadiance`
   * its radiance in the air, rgb. `near` is the metres to the near plane and
   * `viewToWorld` the camera's world matrix. Call before the probe
   * dispatches, so its copies into the uniform land after this write.
   */
  update(
    device: GPUDevice,
    query: WaterQuery,
    palette: readonly WaterType[],
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    toSun: ArrayLike<number>,
    sunRadiance: ArrayLike<number>,
    near: number,
    viewToWorld: ArrayLike<number>
  ): void {
    const probes = this.probes;
    for (let i = 0; i < probes.length; i++)
      if (probes[i] < 0) probes[i] = query.acquireProbe();
    const sample = this.sample;
    const loaded = query.sample(eyeX, eyeZ, sample, probes[0]);
    query.sample(eyeX + LENS_PROBE_STEP, eyeZ, this.beside, probes[1]);
    query.sample(eyeX, eyeZ + LENS_PROBE_STEP, this.beside, probes[2]);
    const covered = loaded && sample.coverage > 0;
    this.covered = covered;
    this.possible = covered && eyeY < sample.level + WAVE_REACH;
    this.submerged = covered && eyeY < sample.surface;
    this.nearSurface =
      covered && Math.abs(eyeY - sample.surface) < LENS_REACH + near;
    if (covered)
      blendWaterOptics(
        palette,
        sample.typeWeights,
        this.extinction,
        this.inScatter
      );

    const buffer = this.buffer(device);
    for (let i = 0; i < probes.length; i++) {
      const copy = this.probeCopies[i];
      copy.sourceOffset = Math.max(probes[i], 0) * PROBE_RESULT_FLOATS * 4;
      copy.target = buffer;
    }

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
    d[LENS_OFFSET] = near;
    d[LENS_OFFSET + 1] = LENS_PROBE_STEP;
    for (let i = 0; i < 16; i++) d[VIEW_TO_WORLD_OFFSET + i] = viewToWorld[i];
    // The probes are left for the GPU copies.
    device.queue.writeBuffer(buffer, 0, d, 0, 4);
    device.queue.writeBuffer(
      buffer,
      OPTICS_OFFSET * 4,
      d,
      OPTICS_OFFSET,
      UNDER_WATER_FLOATS - OPTICS_OFFSET
    );
  }

  /** Marks the camera out of the water, as when the terrain is off. */
  clear(device: GPUDevice): void {
    this.covered = false;
    this.nearSurface = false;
    if (!this.possible && !this.submerged) return;
    this.possible = false;
    this.submerged = false;
    this.data[0] = 0;
    device.queue.writeBuffer(this.buffer(device), 0, this.data, 0, 4);
  }

  /** Lets go of the camera's probes. */
  release(query: WaterQuery): void {
    for (let i = 0; i < this.probes.length; i++) {
      query.releaseProbe(this.probes[i]);
      this.probes[i] = -1;
    }
  }

  dispose(): void {
    this.gpu?.destroy();
    this.gpu = null;
  }
}
