import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class UIElementShared implements ISharedUniformBuffer {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  resolutionValue: Float32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
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
    this.resolutionValue = this.uniformValues.subarray(
      0,
      uniformBufferSize / 4
    );

    this.bindGroup = device.createBindGroup({
      label: 'bind group for object',
      layout: pipelineLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const { device } = renderer;

    // Set the uniform values in our JavaScript side Float32Array
    this.resolutionValue.set([
      renderer.canvas.width,
      renderer.canvas.height,
      renderer.totalDeltaTime,
      0,
    ]);

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformValues as BufferSource
    );
  }
}
