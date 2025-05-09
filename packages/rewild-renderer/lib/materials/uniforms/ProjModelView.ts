import { Renderer } from '../..';
import { IPerMeshUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Transform } from '../../core/Transform';

export class ProjModelView implements IPerMeshUniformBuffer {
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresUpdate = true;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresUpdate = false;

    this.destroy();

    const uniformBufferSize = 4 * 16 * 2; // 4x4 matrix (x2)
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.buffer,
          },
        },
      ],
    });
  }

  prepare(renderer: Renderer, camera: Camera, transform: Transform): void {
    const { device } = renderer;
    const cameraElements = camera.projectionMatrix.elements;
    const modelViewElements = transform.modelViewMatrix.elements;

    device.queue.writeBuffer(
      this.buffer,
      0,
      cameraElements.buffer,
      cameraElements.byteOffset,
      cameraElements.byteLength
    );

    device.queue.writeBuffer(
      this.buffer,
      64,
      modelViewElements.buffer,
      modelViewElements.byteOffset,
      modelViewElements.byteLength
    );
  }
}
