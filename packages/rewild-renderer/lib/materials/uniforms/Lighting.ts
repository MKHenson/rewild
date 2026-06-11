import { Color, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { PointLight } from '../../core/lights/PointLight';
import { SpotLight } from '../../core/lights/SpotLight';

const MAX_LIGHTS = 32;
// Buffer layout: 16-byte header (numLights u32 + 12 bytes implicit padding) then lights array.
// Matches the WGSL struct: struct LightingUniforms { numLights: u32, lights: array<Light> }
// Light stride = 64 bytes = 16 floats (positionOrDirection, intensity, color, range,
// direction, lightType, cosInnerAngle, cosOuterAngle, _pad0, _pad1).
const HEADER_BYTES = 16;
const LIGHT_STRIDE_FLOATS = 16;

export class Lighting implements ISharedUniformBuffer {
  lightingData: ArrayBuffer;
  lightingFloats: Float32Array;
  lightingInts: Uint32Array;
  private _direction: Vector3;
  private _position: Vector3;
  private _color: Color;

  group: number;
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this._direction = new Vector3();
    this._position = new Vector3();
    this._color = new Color();

    const totalSize = HEADER_BYTES + MAX_LIGHTS * LIGHT_STRIDE_FLOATS * 4;
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
    this.requiresBuild = false;

    this.destroy();

    this.buffer = device.createBuffer({
      size: this.lightingData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
    const position = this._position;
    const color = this._color;
    let lightCount = 0;
    // Lights start at byte offset HEADER_BYTES (16), which is float index 4.
    let offset = HEADER_BYTES / 4;

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
        this.lightingFloats[offset + 7] = 0.0;  // range (unused)
        this.lightingFloats[offset + 8] = 0.0;  // direction.x (unused)
        this.lightingFloats[offset + 9] = 0.0;  // direction.y (unused)
        this.lightingFloats[offset + 10] = 0.0; // direction.z (unused)
        this.lightingFloats[offset + 11] = 1.0; // lightType = directional
        this.lightingFloats[offset + 12] = 0.0; // cosInnerAngle (unused)
        this.lightingFloats[offset + 13] = 0.0; // cosOuterAngle (unused)
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      } else if (light instanceof PointLight) {
        position.setFromMatrixPosition(light.transform.matrixWorld);
        position.applyMatrix4(camera.matrixWorldInverse);
        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.radius;
        this.lightingFloats[offset + 8] = 0.0;  // direction.x (unused)
        this.lightingFloats[offset + 9] = 0.0;  // direction.y (unused)
        this.lightingFloats[offset + 10] = 0.0; // direction.z (unused)
        this.lightingFloats[offset + 11] = 0.0; // lightType = point
        this.lightingFloats[offset + 12] = 0.0; // cosInnerAngle (unused)
        this.lightingFloats[offset + 13] = 0.0; // cosOuterAngle (unused)
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      } else if (light instanceof SpotLight) {
        position.copy(light.transform.position);
        position.applyMatrix4(camera.matrixWorldInverse);

        direction
          .subVectors(light.target.position, light.transform.position)
          .normalize();
        direction.transformDirection(camera.matrixWorldInverse).normalize();

        color.copy(light.color);

        this.lightingFloats[offset + 0] = position.x;
        this.lightingFloats[offset + 1] = position.y;
        this.lightingFloats[offset + 2] = position.z;
        this.lightingFloats[offset + 3] = light.intensity;
        this.lightingFloats[offset + 4] = color.r;
        this.lightingFloats[offset + 5] = color.g;
        this.lightingFloats[offset + 6] = color.b;
        this.lightingFloats[offset + 7] = light.range;
        this.lightingFloats[offset + 8] = direction.x;
        this.lightingFloats[offset + 9] = direction.y;
        this.lightingFloats[offset + 10] = direction.z;
        this.lightingFloats[offset + 11] = 2.0; // lightType = spot
        this.lightingFloats[offset + 12] = light.innerAngle;
        this.lightingFloats[offset + 13] = light.outerAngle;
        this.lightingFloats[offset + 14] = 0.0;
        this.lightingFloats[offset + 15] = 0.0;

        offset += LIGHT_STRIDE_FLOATS;
        lightCount++;
      }
    }

    // numLights at byte offset 0 (index 0 of the uint32 view)
    this.lightingInts[0] = lightCount;

    device.queue.writeBuffer(
      this.buffer,
      0,
      this.lightingData,
      0,
      this.lightingData.byteLength
    );
  }
}
