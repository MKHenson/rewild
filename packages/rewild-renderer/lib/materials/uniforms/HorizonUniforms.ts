import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// HorizonParams layout — must match water-horizon.wgsl:
//   centre          vec2f  offset 0
//   innerRadius     f32    offset 8
//   chunkSize       f32    offset 12
//   nearCentre      vec2f  offset 16
//   nearSpan        f32    offset 24
//   seaLevel        f32    offset 28
//   wideCentre      vec2f  offset 32
//   wideSpan        f32    offset 40
//   roughness       f32    offset 44
//   coast           f32    offset 48
//   blendHalfWidth  f32    offset 52
//   maskOrigin      vec2f  offset 56
//   scatter         vec3f  offset 64
//   slopeVariance   f32    offset 76
//   outerRadius     f32    offset 80
//   fadeStart       f32    offset 84
//   fogged          f32    offset 88
//   paletteLayers   2 × vec4f offset 96
//   detailLayer     f32    offset 128
//   detailYSign     f32    offset 132
//   detailTile      f32    offset 136
//   detailStrength  f32    offset 140
const PARAMS_FLOATS = 36;
const PALETTE_OFFSET = 24;
const PALETTE_SIZE = 8;

// Stands in for the atmosphere composite's uniforms when there is no sky.
const ATMOSPHERE_FALLBACK_BYTES = 256;

export interface HorizonParams {
  centreX: number;
  centreZ: number;
  /** Metres from the centre the ring starts. */
  innerRadius: number;
  chunkSize: number;
  nearCentreX: number;
  nearCentreZ: number;
  nearSpan: number;
  wideCentreX: number;
  wideCentreZ: number;
  wideSpan: number;
  seaLevel: number;
  roughness: number;
  coast: number;
  blendHalfWidth: number;
  /** The chunk coordinates the chunk mask is centred on. */
  maskOriginX: number;
  maskOriginZ: number;
  scatter: readonly [number, number, number];
  /** Mean square slope of the waves, all too fine to resolve at this range. */
  slopeVariance: number;
  /** Metres from the centre of the last finite ring. */
  outerRadius: number;
  /** Metres from the centre the land starts flattening to sea level. */
  fadeStart: number;
  /** Whether the ring applies the scene fog, which it does when the sky runs. */
  fogged: boolean;
  /** Albedo array layer of each palette channel. */
  paletteLayers: readonly number[];
  /** Normal and ARM array layer of the material tiled over the far ground. */
  detailLayer: number;
  /** -1 where that material's normal map is OpenGL-convention, else 1. */
  detailYSign: number;
  /** Metres across one tile of it. */
  detailTile: number;
  /** How hard its normal and occlusion apply, 0 to 1. */
  detailStrength: number;
}

export function packHorizonParams(
  params: HorizonParams,
  out: Float32Array = new Float32Array(PARAMS_FLOATS)
): Float32Array {
  out.fill(0);
  out[0] = params.centreX;
  out[1] = params.centreZ;
  out[2] = params.innerRadius;
  out[3] = params.chunkSize;
  out[4] = params.nearCentreX;
  out[5] = params.nearCentreZ;
  out[6] = params.nearSpan;
  out[7] = params.seaLevel;
  out[8] = params.wideCentreX;
  out[9] = params.wideCentreZ;
  out[10] = params.wideSpan;
  out[11] = params.roughness;
  out[12] = params.coast;
  out[13] = params.blendHalfWidth;
  out[14] = params.maskOriginX;
  out[15] = params.maskOriginZ;
  out[16] = params.scatter[0];
  out[17] = params.scatter[1];
  out[18] = params.scatter[2];
  out[19] = params.slopeVariance;
  out[20] = params.outerRadius;
  out[21] = params.fadeStart;
  out[22] = params.fogged ? 1 : 0;
  for (let c = 0; c < PALETTE_SIZE; c++)
    out[PALETTE_OFFSET + c] = params.paletteLayers[c] ?? 0;
  out[32] = params.detailLayer;
  out[33] = params.detailYSign;
  out[34] = params.detailTile;
  out[35] = params.detailStrength;
  return out;
}

export class HorizonUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean = true;

  /** Written to the GPU every frame the ring draws. */
  params: HorizonParams | null = null;

  private _nearWeights: GPUTexture | null = null;
  private _wideWeights: GPUTexture | null = null;
  private _nearGround: GPUTexture | null = null;
  private _wideGround: GPUTexture | null = null;
  private _albedo: GPUTexture | null = null;
  private _normal: GPUTexture | null = null;
  private _arm: GPUTexture | null = null;
  private _detailSampler: GPUSampler | null = null;
  private _chunkMask: GPUTexture | null = null;
  private _atmosphere: GPUBuffer | null = null;
  private _atmosphereFallback: GPUBuffer | null = null;
  private _buffer: GPUBuffer | null = null;
  private _data = new Float32Array(PARAMS_FLOATS);

  constructor(group: number) {
    this.group = group;
  }

  setMaps(
    nearWeights: GPUTexture,
    wideWeights: GPUTexture,
    nearGround: GPUTexture,
    wideGround: GPUTexture,
    chunkMask: GPUTexture
  ) {
    this._nearWeights = nearWeights;
    this._wideWeights = wideWeights;
    this._nearGround = nearGround;
    this._wideGround = wideGround;
    this._chunkMask = chunkMask;
    this.requiresBuild = true;
  }

  /**
   * The terrain material arrays: albedo, whose smallest mip is each material's
   * average, and the normal and ARM the far ground's detail is tiled from.
   */
  setMaterials(albedo: GPUTexture, normal: GPUTexture, arm: GPUTexture) {
    if (albedo === this._albedo && normal === this._normal && arm === this._arm)
      return;
    this._albedo = albedo;
    this._normal = normal;
    this._arm = arm;
    this.requiresBuild = true;
  }

  /** The atmosphere composite's uniform buffer the ring fogs with, if any. */
  setAtmosphere(buffer: GPUBuffer | null) {
    if (buffer === this._atmosphere) return;
    this._atmosphere = buffer;
    this.requiresBuild = true;
  }

  destroy(): void {
    this._buffer?.destroy();
    this._buffer = null;
    this._atmosphereFallback?.destroy();
    this._atmosphereFallback = null;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this._buffer?.destroy();
    this._buffer = device.createBuffer({
      label: 'horizon params',
      size: PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Tiled and seen at grazing angles, so repeating and anisotropic.
    this._detailSampler ??= device.createSampler({
      label: 'horizon detail',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      maxAnisotropy: 16,
    });
    if (!this._atmosphere && !this._atmosphereFallback)
      this._atmosphereFallback = device.createBuffer({
        label: 'horizon atmosphere fallback',
        size: ATMOSPHERE_FALLBACK_BYTES,
        usage: GPUBufferUsage.UNIFORM,
      });

    this.bindGroup = device.createBindGroup({
      label: 'horizon ocean',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        {
          binding: 1,
          resource: this._nearWeights!.createView({ dimension: '2d-array' }),
        },
        { binding: 2, resource: { buffer: this._buffer } },
        {
          binding: 3,
          resource: this._wideWeights!.createView({ dimension: '2d-array' }),
        },
        { binding: 4, resource: this._chunkMask!.createView() },
        { binding: 5, resource: this._nearGround!.createView() },
        { binding: 6, resource: this._wideGround!.createView() },
        {
          binding: 7,
          resource: { buffer: (this._atmosphere ?? this._atmosphereFallback)! },
        },
        {
          binding: 8,
          resource: this._albedo!.createView({ dimension: '2d-array' }),
        },
        { binding: 9, resource: this._detailSampler },
        {
          binding: 10,
          resource: this._normal!.createView({ dimension: '2d-array' }),
        },
        {
          binding: 11,
          resource: this._arm!.createView({ dimension: '2d-array' }),
        },
      ],
    });
    this.requiresBuild = false;
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    if (!this.params || !this._buffer) return;
    packHorizonParams(this.params, this._data);
    renderer.device.queue.writeBuffer(this._buffer, 0, this._data);
  }
}
