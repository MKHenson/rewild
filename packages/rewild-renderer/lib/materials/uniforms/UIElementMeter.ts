import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { UIElement } from '../../core/UIElement';

/** Fill level and colours shared by every element drawn with a meter pass. */
export class UIElementMeter implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  private _value: f32;
  private _fullColor = new Float32Array([0.3, 0.85, 0.15, 0.9]);
  private _emptyColor = new Float32Array([1.0, 0.0, 0.0, 0.9]);

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.requiresUpdate = true;
    this.value = 1.0;
  }

  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
  }

  /** Fill level from 0 to 1. */
  get value(): f32 {
    return this._value;
  }

  set value(value: f32) {
    this._value = value < 0 ? 0 : value > 1 ? 1 : value;
    this.requiresUpdate = true;
  }

  /** Fill colour when full; the fill blends towards the empty colour as it drains. */
  setColors(
    fullR: f32,
    fullG: f32,
    fullB: f32,
    emptyR: f32,
    emptyG: f32,
    emptyB: f32
  ): void {
    this._fullColor[0] = fullR;
    this._fullColor[1] = fullG;
    this._fullColor[2] = fullB;
    this._emptyColor[0] = emptyR;
    this._emptyColor[1] = emptyG;
    this._emptyColor[2] = emptyB;
    this.requiresUpdate = true;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    this.destroy();

    this.requiresBuild = false;
    this.requiresUpdate = true;

    const uniformBufferSize = 12 * 4;
    this.uniformBuffer = device.createBuffer({
      label: 'Meter data uniforms',
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformValues = new Float32Array(uniformBufferSize / 4);

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      label: 'UI element meter data bind group',
      entries: [
        {
          binding: 0,
          resource: {
            label: 'UI element meter data buffer',
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

    this.uniformValues.set(this._fullColor, 0);
    this.uniformValues.set(this._emptyColor, 4);
    this.uniformValues[8] = this._value;

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformValues.buffer,
      0,
      this.uniformValues.byteLength
    );
  }
}
