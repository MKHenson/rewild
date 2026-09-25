import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// HorizonParams layout — must match water-horizon.wgsl:
//   centre          vec2f  offset 0
//   maxViewDst      f32    offset 8
//   chunkSize       f32    offset 12
//   nearCentre      vec2f  offset 16
//   nearSpan        f32    offset 24
//   seaLevel        f32    offset 28
//   wideCentre      vec2f  offset 32
//   wideSpan        f32    offset 40
//   roughness       f32    offset 44
//   coast           f32    offset 48
//   blendHalfWidth  f32    offset 52
//   scatter         vec4f  offset 64
const PARAMS_FLOATS = 20;

export interface HorizonParams {
  centreX: number;
  centreZ: number;
  maxViewDst: number;
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
  scatter: readonly [number, number, number];
}

export function packHorizonParams(
  params: HorizonParams,
  out: Float32Array = new Float32Array(PARAMS_FLOATS)
): Float32Array {
  out.fill(0);
  out[0] = params.centreX;
  out[1] = params.centreZ;
  out[2] = params.maxViewDst;
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
  out[16] = params.scatter[0];
  out[17] = params.scatter[1];
  out[18] = params.scatter[2];
  out[19] = 1;
  return out;
}

export class HorizonUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean = true;

  /** Written to the GPU every frame the ring draws. */
  params: HorizonParams | null = null;

  private _near: GPUTexture | null = null;
  private _wide: GPUTexture | null = null;
  private _buffer: GPUBuffer | null = null;
  private _data = new Float32Array(PARAMS_FLOATS);

  constructor(group: number) {
    this.group = group;
  }

  setMaps(near: GPUTexture, wide: GPUTexture) {
    this._near = near;
    this._wide = wide;
    this.requiresBuild = true;
  }

  destroy(): void {
    this._buffer?.destroy();
    this._buffer = null;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this._buffer?.destroy();
    this._buffer = device.createBuffer({
      label: 'horizon params',
      size: PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'horizon ocean',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 1, resource: this._near!.createView() },
        { binding: 2, resource: { buffer: this._buffer } },
        { binding: 3, resource: this._wide!.createView() },
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
