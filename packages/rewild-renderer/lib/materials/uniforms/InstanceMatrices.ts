import { Matrix3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class InstanceMatrices implements ISharedUniformBuffer {
  transforms: Float32Array;
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  numInstances: number;
  private _normalMatrix: Matrix3;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.numInstances = 0;
    this._normalMatrix = new Matrix3();
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    this.destroy();

    this.requiresBuild = false;
    if (this.numInstances === 0) return;

    // 16 floats for modelViewMatrix + 12 floats for normalMatrix (padded)
    const floatsPerInstance = 28;
    this.transforms = new Float32Array(floatsPerInstance * this.numInstances);

    const uniformBufferSize = 4 * floatsPerInstance * this.numInstances;
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
    this.requiresBuild = true;
  }

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    if (this.numInstances === 0) return;

    const { device } = renderer;
    const transforms = this.transforms;
    const floatsPerInstance = 28;

    let mesh: Mesh;
    for (let i = 0, l = meshes.length; i < l; i++) {
      mesh = meshes[i];
      const offset = i * floatsPerInstance;
      transforms.set(mesh.transform.modelViewMatrix.elements, offset);

      this._normalMatrix.getNormalMatrix(mesh.transform.modelViewMatrix);
      transforms.set(this._normalMatrix.elements, offset + 16);
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
