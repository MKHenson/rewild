import shader from '../../shaders/ocean-fft.wgsl';
import { composeShader } from '../../utils/shaderDefines';
import {
  CASCADE_COUNT,
  CASCADE_FOAM,
  CASCADE_SIZES,
  CascadeFoam,
  FFT_SIZE,
  OCEAN_LOOP_SECONDS,
  SWELL,
  WIND_SEA,
  SeaState,
  WaveSystem,
  cascadeBand,
  foamRates,
  cascadeVariance,
  jonswapShape,
  seaState,
} from './OceanSpectrum';

const FORMAT: GPUTextureFormat = 'rgba16float';
const MIP_LEVELS = Math.log2(FFT_SIZE) + 1;
const TEXELS = FFT_SIZE * FFT_SIZE * CASCADE_COUNT;

// OceanParams in ocean-fft.wgsl.
const PARAMS_FLOATS = 80;
const SYSTEM_A = 32;
const SYSTEM_B = 40;
const SYSTEM_C = 48;
const FOAM = 56;
const SCALARS = 72;

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
  /** Per cascade, the RMS height in metres of the sea it holds now. */
  readonly cascadeRms = new Float64Array(CASCADE_COUNT);
  /** Replaces parts of the sea state the windiness gives, for tuning by eye.
   *  Set it with `overrideSeaState`. */
  private seaOverride: Partial<SeaState> = {};
  /** Crest foam per cascade. Set it with `overrideFoam`. */
  private foam: CascadeFoam[] = CASCADE_FOAM.map((f) => ({ ...f }));

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
   * frame's transforms. `timestamps` times the compute pass (GpuPassTimer).
   */
  update(
    device: GPUDevice,
    deltaSeconds: number,
    windX: number,
    windZ: number,
    windiness: number,
    timestamps?: GPURenderPassTimestampWrites
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
    const sea = { ...seaState(this.windiness), ...this.seaOverride };
    this.windSpeed = sea.windSpeed;

    const rebuild =
      this.builtSpeed < 0 ||
      Math.abs(this.windSpeed - this.builtSpeed) > REBUILD_SPEED ||
      this.windX * this.builtX + this.windZ * this.builtZ < REBUILD_COS;
    if (rebuild) {
      this.builtSpeed = this.windSpeed;
      this.builtX = this.windX;
      this.builtZ = this.windZ;
      const local: WaveSystem = {
        ...WIND_SEA,
        scale: WIND_SEA.scale * sea.heightGain * sea.heightGain,
        windSpeed: this.windSpeed,
        direction: Math.atan2(this.windZ, this.windX),
        omniShare: sea.omniShare,
        longestPeak: sea.longestPeak,
      };
      this.packSystem(0, local);
      this.packSystem(1, SWELL);
      for (let c = 0; c < CASCADE_COUNT; c++)
        this.cascadeRms[c] = Math.sqrt(cascadeVariance([local, SWELL], c));
    }

    this.time = (this.time + deltaSeconds) % OCEAN_LOOP_SECONDS;

    const s = this.data;
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const { whitecap, amount } = this.foam[c];
      const { grow, decay } = foamRates(amount);
      s[FOAM + c * 4] = whitecap;
      s[FOAM + c * 4 + 1] = grow;
      s[FOAM + c * 4 + 2] = decay;
    }
    s[SCALARS] = sea.choppiness;
    s[SCALARS + 1] = this.time;
    s[SCALARS + 2] = Math.min(deltaSeconds, 0.1);
    s[SCALARS + 3] = DEPTH;
    this.words[SCALARS + 4] = SEED;
    s[SCALARS + 5] = (Math.PI * 2) / OCEAN_LOOP_SECONDS;
    device.queue.writeBuffer(this.params, 0, s);

    const encoder = device.createCommandEncoder({ label: 'ocean fft' });
    const pass = encoder.beginComputePass({
      label: 'ocean fft',
      timestampWrites: timestamps as unknown as GPUComputePassTimestampWrites,
    });
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

  /**
   * Replaces parts of the sea state the windiness gives, and rebuilds the
   * spectrum. An empty object goes back to the weather's.
   */
  overrideSeaState(override: Partial<SeaState>): void {
    this.seaOverride = { ...override };
    this.builtSpeed = -1;
  }

  /** Replaces parts of cascade `cascade`'s crest foam. */
  overrideFoam(cascade: number, override: Partial<CascadeFoam>): void {
    this.foam[cascade] = { ...this.foam[cascade], ...override };
  }

  /** Crest foam per cascade, longest first. */
  currentFoam(): CascadeFoam[] {
    return this.foam.map((f) => ({ ...f }));
  }

  /** The sea state the ocean is built for now, with any override. */
  currentSeaState(): SeaState {
    return { ...seaState(this.windiness), ...this.seaOverride };
  }

  private packSystem(index: number, system: WaveSystem) {
    const { alpha, peakOmega } = jonswapShape(
      system.windSpeed,
      system.fetch,
      system.longestPeak
    );
    const a = SYSTEM_A + index * 4;
    const b = SYSTEM_B + index * 4;
    this.data[SYSTEM_C + index * 4] = system.omniShare;
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
