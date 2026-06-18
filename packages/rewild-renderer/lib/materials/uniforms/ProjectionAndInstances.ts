import { Matrix3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class ProjectionAndInstances implements ISharedUniformBuffer {
  private projBuffer: GPUBuffer;
  private transformsBuffer: GPUBuffer;
  private transforms: Float32Array;
  private _normalMatrix: Matrix3;

  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  numInstances: number;

  get buffer(): GPUBuffer {
    return this.projBuffer;
  }

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.numInstances = 0;
    this._normalMatrix = new Matrix3();
  }

  destroy(): void {
    this.projBuffer?.destroy();
    this.transformsBuffer?.destroy();
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;
    this.destroy();

    this.projBuffer = device.createBuffer({
      label: 'projection matrix',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const floatsPerInstance = 28;
    this.transforms = new Float32Array(floatsPerInstance * Math.max(1, this.numInstances));
    this.transformsBuffer = device.createBuffer({
      label: 'instance transforms',
      size: this.transforms.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      label: 'projection and instances',
      entries: [
        { binding: 0, resource: { buffer: this.projBuffer } },
        { binding: 1, resource: { buffer: this.transformsBuffer } },
      ],
    });
  }

  setNumInstances(numInstances: number): void {
    this.numInstances = numInstances;
    this.requiresBuild = true;
  }

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const { device } = renderer;

    const proj = camera.projectionMatrix.elements;
    device.queue.writeBuffer(this.projBuffer, 0, proj.buffer, proj.byteOffset, proj.byteLength);

    if (this.numInstances === 0) return;

    const transforms = this.transforms;
    const floatsPerInstance = 28;
    for (let i = 0, l = meshes.length; i < l; i++) {
      const mesh = meshes[i];
      const offset = i * floatsPerInstance;
      transforms.set(mesh.transform.modelViewMatrix.elements, offset);
      this._normalMatrix.getNormalMatrix(mesh.transform.modelViewMatrix);
      transforms.set(this._normalMatrix.elements, offset + 16);
    }

    device.queue.writeBuffer(
      this.transformsBuffer,
      0,
      transforms.buffer,
      transforms.byteOffset,
      transforms.byteLength
    );
  }
}
