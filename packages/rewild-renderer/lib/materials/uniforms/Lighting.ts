import { Color, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { DirectionLight } from '../../core/lights/DirectionLight';

const MAX_LIGHTS = 4;

export class Lighting implements ISharedUniformBuffer {
  lightingData: ArrayBuffer;
  lightingFloats: Float32Array;
  lightingInts: Uint32Array;
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

    // 8 floats per light * MAX_LIGHTS + 4 floats (numLights + padding)
    const structSize = 8 * 4;
    const totalSize = MAX_LIGHTS * structSize + 16;
    this.lightingData = new ArrayBuffer(totalSize);
    this.lightingFloats = new Float32Array(this.lightingData);
    this.lightingInts = new Uint32Array(this.lightingData);
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

    this.buffer = device.createBuffer({
      size: this.lightingData.byteLength,
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
    let lightCount = 0;
    let offset = 0;

    for (const light of renderer.currentRenderList.lights) {
      if (lightCount >= MAX_LIGHTS) break;

      if (light instanceof DirectionLight) {
        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();

        // Transform light direction to view space using the view matrix rotation part
        // The view matrix inverse rotation transforms world directions to view space
        direction.transformDirection(camera.matrixWorldInverse).normalize();
        color.copy(light.color);

        this.lightingFloats[offset + 0] = direction.x;
        this.lightingFloats[offset + 1] = direction.y;
        this.lightingFloats[offset + 2] = direction.z;
        this.lightingFloats[offset + 3] = light.intensity;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = 0.0; // Padding

        offset += 8;
        lightCount++;
      }
    }

    // Set numLights
    // The lights array takes MAX_LIGHTS * 8 floats.
    // So numLights is at index MAX_LIGHTS * 8 in the float/int array.
    this.lightingInts[MAX_LIGHTS * 8] = lightCount;

    device.queue.writeBuffer(
      this.buffer,
      0,
      this.lightingData,
      0,
      this.lightingData.byteLength
    );
  }
}
