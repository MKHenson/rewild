import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';

export class UIElementInstanceData implements ISharedUniformBuffer {
  instanceData: Float32Array;
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  numInstances: number;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
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

    this.requiresBuild = false;
    if (this.numInstances === 0) return;

    const floatsPerInstance = 4;
    this.instanceData = new Float32Array(floatsPerInstance * this.numInstances);

    const uniformBufferSize = 4 * floatsPerInstance * this.numInstances;
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      label: 'UI element instance data bind group',
      entries: [
        {
          binding: 0,
          resource: {
            label: 'UI element instance data buffer',
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

  prepare(renderer: Renderer, camera: Camera, elements: UIElement[]): void {
    if (this.numInstances === 0) return;

    const { device } = renderer;
    const transforms = this.instanceData;
    const floatsPerInstance = 4;

    let element: UIElement;
    for (let i = 0, l = elements.length; i < l; i++) {
      element = elements[i];
      const offset = i * floatsPerInstance;
      transforms[offset + 0] = element.x;
      transforms[offset + 1] = element.y;
      transforms[offset + 2] = element.width;
      transforms[offset + 3] = element.height;
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
