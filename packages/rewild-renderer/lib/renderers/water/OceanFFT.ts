import shader from '../../shaders/ocean-fft.wgsl';
import { composeShader } from '../../utils/shaderDefines';
import {
  CASCADE_COUNT,
  CASCADE_SIZES,
  FFT_SIZE,
  OCEAN_LOOP_SECONDS,
  SWELL,
  WIND_SEA,
  WaveSystem,
  cascadeBand,
  jonswapShape,
  oceanWindSpeed,
} from './OceanSpectrum';

const FORMAT: GPUTextureFormat = 'rgba16float';
const MIP_LEVELS = Math.log2(FFT_SIZE) + 1;
const TEXELS = FFT_SIZE * FFT_SIZE * CASCADE_COUNT;

// OceanParams in ocean-fft.wgsl.
const PARAMS_FLOATS = 64;
const SYSTEM_A = 32;
const SYSTEM_B = 40;
const SCALARS = 48;

// Sideways displacement as a share of its linear value. Raising it pulls
// crests narrower and sharper and troughs broader; around 1 looks like a
// wind sea, much past 2 folds crests over each other and shows as pinched,
// flickering peaks. It also compresses the surface more, so more foam.
const CHOPPINESS = 0.9;
// Foam is made in a texel where the surface's stretch (the Jacobian: 1 flat,
// below 1 squeezed, below 0 folded) falls below FOAM_BIAS. Raise it for foam
// on gentler crests, lower it to keep foam to the steepest.
const FOAM_BIAS = 0.92;
// How fast the foam made rises with how far below FOAM_BIAS the stretch is:
// higher gives crisp, full caps as soon as a crest qualifies.
const FOAM_GAIN = 3;
// How fast foam fades: exp(−decay × seconds), halving every 0.69 / decay
// seconds (2 s at 0.35, 0.7 s at 0.95). Lower leaves longer trails behind the
// crests.
const FOAM_DECAY = 1.15;
// Foam added per second while a texel is squeezed: higher builds thick caps
// from a brief squeeze.
const FOAM_ADD = 5.5;
// Water depth in metres for the dispersion. Deep water at 500; lower slows
// the longest waves as they would over a shelf.
const DEPTH = 500;
// Picks the random sea; another seed is another ocean of the same kind.
const SEED = 1337;
// Seconds the wind the spectrum follows takes to catch the weather's, so a
// sea builds and calms rather than snapping.
const WIND_LAG = 6;
// How far the lagged wind moves before the spectrum is rebuilt. The random
// phases are seeded per wavenumber, so a rebuild changes only the amplitudes
// and the surface never jumps.
const REBUILD_SPEED = 0.05;
const REBUILD_COS = Math.cos((0.5 * Math.PI) / 180);
// How much faster the clock runs in full wind, so a storm's chop looks
// agitated. The clock only accumulates, so a change of rate never jumps.
export const WIND_TIME_SPEEDUP = 1.8;

/**
 * The FFT ocean: every frame, one compute pass turns each cascade's spectrum
 * into displacement and slope textures (2D arrays, one layer per cascade,
 * mipmapped) that the water shader samples.
 */
export class OceanFFT {
  readonly displacement: GPUTexture;
  readonly slopes: GPUTexture;
  /** Linear, repeating and anisotropic, for sampling both. */
  readonly sampler: GPUSampler;
  /** Seconds on the looping ocean clock. */
  time = 0;
  /** The lagged wind speed in m/s the spectrum was last built for. */
  windSpeed = 0;

  private params: GPUBuffer;
  private data = new Float32Array(PARAMS_FLOATS);
  private words = new Uint32Array(this.data.buffer);
  private buffers: GPUBuffer[] = [];
  private init: { pipeline: GPUComputePipeline; group: GPUBindGroup };
  private conjugate: { pipeline: GPUComputePipeline; group: GPUBindGroup };
  private rows: { pipeline: GPUComputePipeline; group: GPUBindGroup };
  private columns: { pipeline: GPUComputePipeline; group: GPUBindGroup };
  private mips: {
    pipeline: GPUComputePipeline;
    group: GPUBindGroup;
    far: boolean;
  }[] = [];

  private windX = 1;
  private windZ = 0;
  private windiness = 0;
  private builtX = 0;
  private builtZ = 0;
  private builtSpeed = -1;
  private started = false;

  constructor(device: GPUDevice) {
    const module = device.createShaderModule({
      label: 'ocean fft',
      code: composeShader([shader], {
        FFT_N: `${FFT_SIZE}u`,
        FFT_HALF: `${FFT_SIZE / 2}u`,
        FFT_LOG2N: `${Math.log2(FFT_SIZE)}u`,
        FFT_SHARED: `${FFT_SIZE * 2}`,
      }),
    });

    const storage = (label: string, bytes: number) => {
      const buffer = device.createBuffer({
        label,
        size: bytes,
        usage: GPUBufferUsage.STORAGE,
      });
      this.buffers.push(buffer);
      return buffer;
    };
    const h0 = storage('ocean h0', TEXELS * 16);
    const waveData = storage('ocean wave data', TEXELS * 16);
    const scratch = storage('ocean scratch', TEXELS * 32);
    const foam = storage('ocean foam', TEXELS * 4);
    const mipSource = storage('ocean mip source', TEXELS * 32);
    const mipMiddle = storage('ocean mip middle', 16 * 16 * CASCADE_COUNT * 32);

    this.params = device.createBuffer({
      label: 'ocean params',
      size: PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const texture = (label: string) =>
      device.createTexture({
        label,
        size: [FFT_SIZE, FFT_SIZE, CASCADE_COUNT],
        format: FORMAT,
        mipLevelCount: MIP_LEVELS,
        usage:
          GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.displacement = texture('ocean displacement');
    this.slopes = texture('ocean slopes');
    this.sampler = device.createSampler({
      label: 'ocean',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    });

    const level = (target: GPUTexture, mip: number) =>
      target.createView({
        dimension: '2d-array',
        baseMipLevel: mip,
        mipLevelCount: 1,
      });
    const kernel = (
      entryPoint: string,
      entries: [number, GPUBindingResource][],
      constants?: Record<string, number>
    ) => {
      const pipeline = device.createComputePipeline({
        label: `ocean ${entryPoint}`,
        layout: 'auto',
        compute: { module, entryPoint, constants },
      });
      const group = device.createBindGroup({
        label: `ocean ${entryPoint}`,
        layout: pipeline.getBindGroupLayout(0),
        entries: entries.map(([binding, resource]) => ({ binding, resource })),
      });
      return { pipeline, group };
    };

    const params: GPUBindingResource = { buffer: this.params };
    this.init = kernel('initSpectrum', [
      [0, params],
      [2, { buffer: waveData }],
      [3, { buffer: scratch }],
    ]);
    this.conjugate = kernel('conjugate', [
      [1, { buffer: h0 }],
      [3, { buffer: scratch }],
    ]);
    this.rows = kernel('rows', [
      [0, params],
      [1, { buffer: h0 }],
      [2, { buffer: waveData }],
      [3, { buffer: scratch }],
    ]);
    this.columns = kernel('columns', [
      [0, params],
      [3, { buffer: scratch }],
      [4, { buffer: foam }],
      [5, { buffer: mipSource }],
      [7, level(this.displacement, 0)],
      [8, level(this.slopes, 0)],
    ]);
    [this.displacement, this.slopes].forEach((target, source) => {
      const near = kernel(
        'mipsNear',
        [
          [5, { buffer: mipSource }],
          [6, { buffer: mipMiddle }],
          [9, level(target, 1)],
          [10, level(target, 2)],
          [11, level(target, 3)],
          [12, level(target, 4)],
        ],
        { MIP_SOURCE: source }
      );
      const far = kernel(
        'mipsFar',
        [
          [6, { buffer: mipMiddle }],
          [9, level(target, 5)],
          [10, level(target, 6)],
          [11, level(target, 7)],
          [12, level(target, 8)],
        ],
        { MIP_SOURCE: source }
      );
      this.mips.push({ ...near, far: false }, { ...far, far: true });
    });

    for (let c = 0; c < CASCADE_COUNT; c++) {
      const [low, high] = cascadeBand(c);
      this.data[c * 4] = CASCADE_SIZES[c];
      this.data[16 + c * 4] = low;
      this.data[16 + c * 4 + 1] = high;
    }
  }

  /**
   * Advances the ocean by `deltaSeconds` under the weather's wind (`windX`,
   * `windZ` the direction the air moves, `windiness` 0..1) and encodes this
   * frame's transforms.
   */
  update(
    device: GPUDevice,
    deltaSeconds: number,
    windX: number,
    windZ: number,
    windiness: number
  ): void {
    const length = Math.hypot(windX, windZ);
    const targetX = length > 0 ? windX / length : this.windX;
    const targetZ = length > 0 ? windZ / length : this.windZ;
    const target = Math.min(1, Math.max(0, windiness));
    if (!this.started) {
      this.started = true;
      this.windX = targetX;
      this.windZ = targetZ;
      this.windiness = target;
    } else {
      const follow = 1 - Math.exp(-deltaSeconds / WIND_LAG);
      this.windX += (targetX - this.windX) * follow;
      this.windZ += (targetZ - this.windZ) * follow;
      const norm = Math.hypot(this.windX, this.windZ) || 1;
      this.windX /= norm;
      this.windZ /= norm;
      this.windiness += (target - this.windiness) * follow;
    }
    this.windSpeed = oceanWindSpeed(this.windiness);

    const rebuild =
      Math.abs(this.windSpeed - this.builtSpeed) > REBUILD_SPEED ||
      this.windX * this.builtX + this.windZ * this.builtZ < REBUILD_COS;
    if (rebuild) {
      this.builtSpeed = this.windSpeed;
      this.builtX = this.windX;
      this.builtZ = this.windZ;
      const local: WaveSystem = {
        ...WIND_SEA,
        windSpeed: this.windSpeed,
        direction: Math.atan2(this.windZ, this.windX),
      };
      this.packSystem(0, local);
      this.packSystem(1, SWELL);
    }

    const rate = 1 + WIND_TIME_SPEEDUP * this.windiness;
    this.time = (this.time + deltaSeconds * rate) % OCEAN_LOOP_SECONDS;

    const s = this.data;
    s[SCALARS] = CHOPPINESS;
    s[SCALARS + 1] = FOAM_BIAS;
    s[SCALARS + 2] = FOAM_GAIN;
    s[SCALARS + 3] = FOAM_DECAY;
    s[SCALARS + 4] = FOAM_ADD;
    s[SCALARS + 5] = this.time;
    s[SCALARS + 6] = Math.min(deltaSeconds, 0.1);
    s[SCALARS + 7] = DEPTH;
    this.words[SCALARS + 8] = SEED;
    s[SCALARS + 9] = (Math.PI * 2) / OCEAN_LOOP_SECONDS;
    device.queue.writeBuffer(this.params, 0, s);

    const encoder = device.createCommandEncoder({ label: 'ocean fft' });
    const pass = encoder.beginComputePass({ label: 'ocean fft' });
    const tiles = FFT_SIZE / 16;
    if (rebuild) {
      this.dispatch(pass, this.init, tiles, tiles, CASCADE_COUNT);
      this.dispatch(pass, this.conjugate, tiles, tiles, CASCADE_COUNT);
    }
    this.dispatch(pass, this.rows, FFT_SIZE, CASCADE_COUNT, 1);
    this.dispatch(pass, this.columns, FFT_SIZE, CASCADE_COUNT, 1);
    for (const mip of this.mips)
      if (mip.far) this.dispatch(pass, mip, 1, 1, CASCADE_COUNT);
      else
        this.dispatch(pass, mip, FFT_SIZE / 32, FFT_SIZE / 32, CASCADE_COUNT);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.displacement.destroy();
    this.slopes.destroy();
    this.params.destroy();
    for (const buffer of this.buffers) buffer.destroy();
    this.buffers.length = 0;
  }

  private dispatch(
    pass: GPUComputePassEncoder,
    kernel: { pipeline: GPUComputePipeline; group: GPUBindGroup },
    x: number,
    y: number,
    z: number
  ) {
    pass.setPipeline(kernel.pipeline);
    pass.setBindGroup(0, kernel.group);
    pass.dispatchWorkgroups(x, y, z);
  }

  private packSystem(index: number, system: WaveSystem) {
    const { alpha, peakOmega } = jonswapShape(system.windSpeed, system.fetch);
    const a = SYSTEM_A + index * 4;
    const b = SYSTEM_B + index * 4;
    this.data[a] = system.scale;
    this.data[a + 1] = system.direction;
    this.data[a + 2] = system.spreadBlend;
    this.data[a + 3] = system.swell;
    this.data[b] = alpha;
    this.data[b + 1] = peakOmega;
    this.data[b + 2] = system.peakEnhancement;
    this.data[b + 3] = system.shortWavesFade;
  }
}
