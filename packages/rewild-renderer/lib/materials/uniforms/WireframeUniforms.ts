import { Color } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class WireframeUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  buffer: GPUBuffer;

  private _color: Color;
  private _opacity: f32;
  private _valuesArray: Float32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this._valuesArray = new Float32Array(4);
    this.color = new Color(1, 1, 1);
    this.opacity = 1.0;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    const uniformBufferSize = 4 * 4; // vec4<f32> for color and opacity
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'wireframe bind group',
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

  set color(color: Color) {
    this._color = color;
    this.requiresUpdate = true;
    this._valuesArray[0] = color.r;
    this._valuesArray[1] = color.g;
    this._valuesArray[2] = color.b;
  }

  get color(): Color {
    return this._color;
  }

  set opacity(opacity: f32) {
    this._opacity = opacity;
    this.requiresUpdate = true;
    this._valuesArray[3] = opacity;
  }

  get opacity(): f32 {
    return this._opacity;
  }

  setNumInstances(numInstances: number): void {}

  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const { device } = renderer;
    if (this.requiresUpdate) {
      this.requiresUpdate = false;
      device.queue.writeBuffer(
        this.buffer,
        0,
        this._valuesArray.buffer,
        this._valuesArray.byteOffset,
        this._valuesArray.byteLength
      );
    }
  }
}
