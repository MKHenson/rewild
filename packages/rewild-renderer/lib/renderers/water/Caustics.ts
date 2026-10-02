import shader from '../../shaders/caustics.wgsl';
import { MipMapGenerator } from '../../textures/MipMapGenerator';
import { CASCADE_SIZES, FFT_SIZE } from './OceanSpectrum';
import type { OceanFFT } from './OceanFFT';
import { refractedSunCosine } from './UnderWater';

/** The cascade whose tile the caustics cover: ripples 5 cm to 1.2 m long,
 *  curved enough to focus the sun a metre or two down. Longer waves focus
 *  far below any lake bed. Mirrors CAUSTIC_CASCADE in
 *  shader-lib/caustics.wgsl. */
export const CAUSTIC_CASCADE = 3;
/** Floats in CausticsParams (shader-lib/caustics.wgsl). */
export const CAUSTICS_PARAMS_FLOATS = 12;
/** Texels per side of the caustics texture. Mirrors CAUSTIC_TEXELS in
 *  shader-lib/caustics.wgsl. */
export const CAUSTIC_TEXELS = 512;
const MIP_LEVELS = Math.log2(CAUSTIC_TEXELS) + 1;
const FORMAT: GPUTextureFormat = 'rg16float';
/** Most metres a ray lands from where a calm surface would land it. Sets the
 *  grid's margin. */
export const CAUSTIC_MAX_SHIFT = 1;
/** The most light one triangle adds to a texel, so a grid folded flat cannot
 *  overflow. */
const MAX_LIGHT = 40;
/** Air over water's index of refraction. */
const AIR_TO_WATER = 0.75;
/** The sun's cosine from straight up over which caustics fade in. */
const SUN_FADE = 0.1;
// Build in caustics.wgsl.
const BUILD_FLOATS = 12;

export interface CausticsSettings {
  /** 0..1: how strongly the waves focus the sun; 0 is off. */
  strength: number;
  /** Metres down to the shallow plane. */
  shallow: number;
  /** Metres down to the deep plane. */
  deep: number;
}

export const DEFAULT_CAUSTICS: CausticsSettings = {
  strength: 0.5,
  shallow: 0,
  deep: 4,
};

/** Grid cells past each edge of a `tile` metres wide, so a ray that lands in
 *  the tile from outside it is drawn. */
export function causticMargin(tile: number): number {
  return Math.ceil((CAUSTIC_MAX_SHIFT / tile) * FFT_SIZE) + 1;
}

/**
 * Packs CausticsParams for a camera at world (`eyeX`, `eyeZ`) under a sun
 * toward the world direction `toSun`, into `out`. `weight` is the camera's
 * water's weight on the cascade. Returns the strength; at 0 nothing needs the
 * caustics drawn.
 */
export function packCausticsParams(
  out: Float32Array,
  settings: CausticsSettings,
  eyeX: number,
  eyeZ: number,
  toSun: ArrayLike<number>,
  weight: number
): number {
  const tile = CASCADE_SIZES[CAUSTIC_CASCADE];
  const x = eyeX / tile;
  const z = eyeZ / tile;
  const sunUp = toSun[1];
  const mu = refractedSunCosine(sunUp);
  const rise = Math.min(Math.max(sunUp / SUN_FADE, 0), 1);
  const strength =
    mu > 0 ? Math.max(settings.strength, 0) * rise * rise * (3 - 2 * rise) : 0;
  const shallow = Math.max(settings.shallow, 0.1);
  out[0] = x - Math.floor(x);
  out[1] = z - Math.floor(z);
  out[2] = 1 / tile;
  out[3] = strength;
  out[4] = mu > 0 ? (toSun[0] * AIR_TO_WATER) / mu : 0;
  out[5] = mu > 0 ? (toSun[2] * AIR_TO_WATER) / mu : 0;
  out[6] = shallow;
  out[7] = Math.max(settings.deep, shallow + 0.1);
  out[8] = weight;
  return strength;
}

/**
 * Caustics by photon splatting (caustics.wgsl): each frame a grid over one
 * FFT cascade's tile refracts the sun through the waves and lands it on a
 * shallow and a deep plane, into one tiling texture. The terrain, materials
 * under water and the light shafts sample it (shader-lib/caustics.wgsl). The
 * texture, sampler and params outlive the terrain's chunks, so passes can
 * bind them once.
 */
export class Caustics {
  settings: CausticsSettings = { ...DEFAULT_CAUSTICS };
  private map: GPUTexture | null = null;
  private repeat: GPUSampler | null = null;
  private params: GPUBuffer | null = null;
  private data = new Float32Array(CAUSTICS_PARAMS_FLOATS);
  private build: GPUBuffer | null = null;
  private buildData = new Float32Array(BUILD_FLOATS);
  private pipeline: GPURenderPipeline | null = null;
  private group: GPUBindGroup | null = null;
  private boundSlopes: GPUTexture | null = null;
  private mips = new MipMapGenerator();

  /** The caustics: r the shallow plane, g the deep one; 1 is calm light.
   *  Mipmapped, so a distant bed reads the average. */
  texture(device: GPUDevice): GPUTexture {
    if (!this.map)
      this.map = device.createTexture({
        label: 'caustics',
        size: [CAUSTIC_TEXELS, CAUSTIC_TEXELS],
        format: FORMAT,
        mipLevelCount: MIP_LEVELS,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    return this.map;
  }

  /** Linear and repeating, for sampling the texture. */
  sampler(device: GPUDevice): GPUSampler {
    if (!this.repeat)
      this.repeat = device.createSampler({
        label: 'caustics',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      });
    return this.repeat;
  }

  /** The CausticsParams uniform. */
  buffer(device: GPUDevice): GPUBuffer {
    if (!this.params)
      this.params = device.createBuffer({
        label: 'caustics params',
        size: CAUSTICS_PARAMS_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    return this.params;
  }

  /**
   * Writes the params for a camera at world (`eyeX`, `eyeZ`) and the sun
   * toward world `toSun`, and draws this frame's caustics from the ocean's
   * slopes while `wanted`, as when water is in view. `weight` is the camera's
   * water's weight on the cascade.
   */
  update(
    device: GPUDevice,
    ocean: OceanFFT,
    toSun: ArrayLike<number>,
    eyeX: number,
    eyeZ: number,
    weight: number,
    wanted: boolean,
    timestamps?: GPURenderPassTimestampWrites
  ): void {
    const strength = packCausticsParams(
      this.data,
      this.settings,
      eyeX,
      eyeZ,
      toSun,
      weight
    );
    device.queue.writeBuffer(this.buffer(device), 0, this.data);
    if (strength <= 0 || !wanted) return;

    if (!this.pipeline) this.createPipeline(device);
    if (!this.build)
      this.build = device.createBuffer({
        label: 'caustics build',
        size: BUILD_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    if (this.boundSlopes !== ocean.slopes) {
      this.boundSlopes = ocean.slopes;
      this.group = device.createBindGroup({
        label: 'caustics',
        layout: this.pipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.build } },
          {
            binding: 1,
            resource: ocean.slopes.createView({ dimension: '2d-array' }),
          },
        ],
      });
    }

    const tile = CASCADE_SIZES[CAUSTIC_CASCADE];
    const margin = causticMargin(tile);
    const cells = FFT_SIZE + 2 * margin;
    const texel = tile / CAUSTIC_TEXELS;
    const b = this.buildData;
    b[0] = toSun[0];
    b[1] = toSun[1];
    b[2] = toSun[2];
    b[4] = cells;
    b[5] = margin;
    b[6] = tile;
    b[7] = CAUSTIC_MAX_SHIFT;
    b[8] = this.data[6];
    b[9] = this.data[7];
    b[10] = texel * texel;
    b[11] = MAX_LIGHT;
    device.queue.writeBuffer(this.build, 0, b);

    const encoder = device.createCommandEncoder({ label: 'caustics' });
    const pass = encoder.beginRenderPass({
      label: 'caustics',
      colorAttachments: [
        {
          view: this.texture(device).createView({
            baseMipLevel: 0,
            mipLevelCount: 1,
          }),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites: timestamps,
    });
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group!);
    pass.draw(cells * cells * 6, 2);
    pass.end();
    device.queue.submit([encoder.finish()]);
    this.mips.generateMips(device, this.texture(device));
  }

  private createPipeline(device: GPUDevice) {
    const module = device.createShaderModule({
      label: 'caustics',
      code: shader,
    });
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one' };
    this.pipeline = device.createRenderPipeline({
      label: 'caustics',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: FORMAT, blend: { color: add, alpha: add } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
  }

  dispose(): void {
    this.map?.destroy();
    this.params?.destroy();
    this.build?.destroy();
    this.map = null;
    this.params = null;
    this.build = null;
    this.repeat = null;
    this.pipeline = null;
    this.group = null;
    this.boundSlopes = null;
  }
}
