import { Renderer } from '../..';
import { Mesh } from '../../core/Mesh';
import { IUniformBuffer } from './IUniformBuffer';

export class ProjModelView implements IUniformBuffer {
  buffer: GPUBuffer;
  group: number = 0;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresUpdate = true;
  }

  init(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresUpdate = false;

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

  prepareBuffer(renderer: Renderer, mesh: Mesh): void {
    const { device, perspectiveCam } = renderer;
    const cameraElements = perspectiveCam.camera.projectionMatrix.elements;
    const modelViewElements = mesh.transform.modelViewMatrix.elements;

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
