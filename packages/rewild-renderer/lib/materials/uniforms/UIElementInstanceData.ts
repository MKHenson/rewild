import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';

const floatsPerInstance = 16; // x, y, width, height, bgColor(4), borderColor(4), borderRadius, pad(3)

export class UIElementInstanceData implements ISharedUniformBuffer {
  instanceData: Float32Array;
  buffer: GPUBuffer;
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  numInstances: number;
  private _capacity: number = 0;

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

    this._capacity = Math.max(this.numInstances, this._capacity * 2, 4);
    this.instanceData = new Float32Array(floatsPerInstance * this._capacity);

    const uniformBufferSize = 4 * floatsPerInstance * this._capacity;
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
    if (numInstances > this._capacity) {
      this.requiresBuild = true;
    }
  }

  prepare(renderer: Renderer, camera: Camera, elements: UIElement[]): void {
    if (elements.length === 0 || !this.buffer) return;

    const { device } = renderer;
    const transforms = this.instanceData;

    for (let i = 0, l = elements.length; i < l; i++) {
      const element = elements[i];
      const offset = i * floatsPerInstance;
      transforms[offset + 0] = element.getX(renderer);
      transforms[offset + 1] = element.getY(renderer);
      transforms[offset + 2] = element.getWidth(renderer);
      transforms[offset + 3] = element.getHeight(renderer);
      transforms[offset + 4] = element.backgroundColor.r;
      transforms[offset + 5] = element.backgroundColor.g;
      transforms[offset + 6] = element.backgroundColor.b;
      transforms[offset + 7] = element.backgroundColorAlpha;
      transforms[offset + 8] = element.borderColor.r;
      transforms[offset + 9] = element.borderColor.g;
      transforms[offset + 10] = element.borderColor.b;
      transforms[offset + 11] = element.borderColorAlpha;
      transforms[offset + 12] = element.borderRadius;
    }

    const bytesToUpload = elements.length * floatsPerInstance * 4;
    device.queue.writeBuffer(
      this.buffer,
      0,
      transforms.buffer,
      transforms.byteOffset,
      bytesToUpload
    );
  }
}
