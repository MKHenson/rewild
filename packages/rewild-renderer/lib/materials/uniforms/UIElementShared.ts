import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class UIElementShared implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  private _lastWidth: number = 0;
  private _lastHeight: number = 0;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
  }

  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    const uniformBufferSize = 4 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: pipelineLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const width = renderer.canvas.width;
    const height = renderer.canvas.height;

    if (width !== this._lastWidth || height !== this._lastHeight) {
      this._lastWidth = width;
      this._lastHeight = height;
      this.uniformValues[0] = width;
      this.uniformValues[1] = height;
    }

    this.uniformValues[2] = renderer.totalDeltaTime;

    renderer.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformValues as BufferSource
    );
  }
}
