import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class InstanceMatrices implements ISharedUniformBuffer {
  transforms: Float32Array;
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;
  numInstances: number;

  constructor(group: number) {
    this.group = group;
    this.requiresUpdate = true;
    this.numInstances = 0;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    this.destroy();

    this.requiresUpdate = false;
    if (this.numInstances === 0) return;

    this.transforms = new Float32Array(16 * this.numInstances);

    const uniformBufferSize = 4 * 16 * this.numInstances; // 4x4 matrix (x num instances)
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      label: 'instance matrices bind group',
      entries: [
        {
          binding: 0,
          resource: {
            label: 'instance matrices buffer',
            buffer: this.buffer,
          },
        },
      ],
    });
  }

  setNumInstances(numInstances: number): void {
    this.numInstances = numInstances;
    this.requiresUpdate = true;
  }

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    if (this.numInstances === 0) return;

    const { device } = renderer;
    const transforms = this.transforms;

    let mesh: Mesh;
    for (let i = 0, l = meshes.length; i < l; i++) {
      mesh = meshes[i];
      transforms.set(mesh.transform.modelViewMatrix.elements, i * 16);
    }

    device.queue.writeBuffer(
      this.buffer,
      0,
      transforms.buffer,
      transforms.byteOffset,
      transforms.byteLength
    );
  }
}
