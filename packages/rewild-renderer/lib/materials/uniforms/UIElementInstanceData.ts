import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';
import { Vector3 } from 'rewild-common';

const floatsPerInstance = 16; // x, y, width, height, color.r, color.g, color.b, color.a, borderColor.r, borderColor.g, borderColor.b, borderColor.a, borderRadius (3 padding)
const _v3 = new Vector3();
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

    let element: UIElement;
    for (let i = 0, l = elements.length; i < l; i++) {
      element = elements[i];
      element.transform.getWorldPosition(_v3);

      const offset = i * floatsPerInstance;
      transforms[offset + 0] = _v3.x;
      transforms[offset + 1] = _v3.y;
      transforms[offset + 2] = element.width;
      transforms[offset + 3] = element.height;
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

    device.queue.writeBuffer(
      this.buffer,
      0,
      transforms.buffer,
      transforms.byteOffset,
      transforms.byteLength
    );
  }
}
