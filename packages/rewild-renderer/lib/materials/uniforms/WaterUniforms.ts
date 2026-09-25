import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// WaterParams layout — must match water.wgsl:
//   color   vec4f  offset 0
//   texels  f32    offset 16
const PARAMS_SIZE = 32;

export class WaterUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean = true;

  /** Linear diffuse colour until the surface shading lands. */
  color: [number, number, number] = [0.02, 0.06, 0.09];
  texels: number = 1;

  private _surfaceTexture: GPUTexture | null = null;
  private _paramsBuffer: GPUBuffer | null = null;
  private _paramsData = new Float32Array(PARAMS_SIZE / 4);

  constructor(group: number) {
    this.group = group;
  }

  set surfaceTexture(texture: GPUTexture) {
    this._surfaceTexture = texture;
    this.texels = texture.width;
    this.requiresBuild = true;
  }

  destroy(): void {
    this._paramsBuffer?.destroy();
    this._paramsBuffer = null;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    this._paramsBuffer?.destroy();
    this._paramsBuffer = device.createBuffer({
      label: 'water params',
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const data = this._paramsData;
    data[0] = this.color[0];
    data[1] = this.color[1];
    data[2] = this.color[2];
    data[3] = 1;
    data[4] = this.texels;
    device.queue.writeBuffer(this._paramsBuffer, 0, data);

    this.bindGroup = device.createBindGroup({
      label: 'water surface',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 1, resource: this._surfaceTexture!.createView() },
        { binding: 2, resource: { buffer: this._paramsBuffer } },
      ],
    });

    this.requiresBuild = false;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
