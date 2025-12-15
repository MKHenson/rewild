import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';

export class UIElementHealth implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  private _health: f32;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.requiresUpdate = true;
    this.health = 1.0;
  }

  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
  }

  get health(): f32 {
    return this._health;
  }

  set health(value: f32) {
    this._health = value < 0 ? 0 : value > 1 ? 1 : value;
    this.requiresUpdate = true;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    this.destroy();

    this.requiresBuild = false;

    const uniformBufferSize = 1 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'Health data uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);
    this.uniformValues[0] = this._health;

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      label: 'UI element health data bind group',
      entries: [
        {
          binding: 0,
          resource: {
            label: 'UI element health data buffer',
            buffer: this.uniformBuffer,
          },
        },
      ],
    });
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, elements: UIElement[]): void {
    if (!this.requiresUpdate) return;

    const { device } = renderer;
    this.requiresUpdate = false;

    this.uniformValues[0] = this._health;

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformValues.buffer,
      0,
      this.uniformValues.byteLength
    );
  }
}
