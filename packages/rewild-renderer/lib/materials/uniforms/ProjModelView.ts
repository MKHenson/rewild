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

    const uniformBufferSize = 48 + 64 + 64; // mat3x3f (48 bytes) + 2x mat4x4f (64 bytes each) = 176 bytes
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'proj-model-view bind group',
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

    // Use the existing normalMatrix that's computed in the renderer (like Three.js)
    const normalElements = transform.normalMatrix.elements;

    device.queue.writeBuffer(
      this.buffer,
      0,
      normalElements.buffer,
      normalElements.byteOffset,
      normalElements.byteLength
    );

    device.queue.writeBuffer(
      this.buffer,
      48,
      cameraElements.buffer,
      cameraElements.byteOffset,
      cameraElements.byteLength
    );

    device.queue.writeBuffer(
      this.buffer,
      112,
      modelViewElements.buffer,
      modelViewElements.byteOffset,
      modelViewElements.byteLength
    );
  }
}
