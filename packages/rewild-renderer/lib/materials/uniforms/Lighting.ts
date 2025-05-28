import { Color, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { samplerManager } from '../../textures/SamplerManager';
import { textureManager } from '../../textures/TextureManager';
import { DirectionLight } from '../../core/lights/DirectionLight';

export class Lighting implements ISharedUniformBuffer {
  lighting: Float32Array = new Float32Array(8);
  private _direction: Vector3;
  private _color: Color;

  group: number;
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresUpdate = true;
    this._direction = new Vector3();
    this._color = new Color();
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

    const uniformBufferSize =
      4 * 3 + // direction
      4 * 1 + // intensity
      4 * 3 + // color
      4 * 1 + // padding
      0;

    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
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

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {
    const { device } = renderer;

    const direction = this._direction;
    const color = this._color;

    // Set the direction and color of the light
    this._direction.set(0, 1, 0);
    let intensity = 0.0;

    for (const light of renderer.currentRenderList.lights) {
      if (light instanceof DirectionLight) {
        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();

        color.copy(light.color);
        intensity += light.intensity;
      }
    }

    this.lighting[0] = direction.x;
    this.lighting[1] = direction.y;
    this.lighting[2] = direction.z;
    this.lighting[3] = intensity;
    this.lighting[4] = color.r;
    this.lighting[5] = color.g;
    this.lighting[6] = color.b;
    this.lighting[7] = 0.0; // Padding

    device.queue.writeBuffer(
      this.buffer,
      0,
      this.lighting.buffer,
      this.lighting.byteOffset,
      this.lighting.byteLength
    );
  }
}
