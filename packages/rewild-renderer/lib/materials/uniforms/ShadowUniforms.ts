import { Matrix4 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { IVisualComponent } from '../../../types/interfaces';

const _tempMat = new Matrix4();

/**
 * Manages bind group 3 — all shadow resources for a material pass.
 *
 * Bindings 0–2: cloud shadow (transmittance map, linear sampler, params buffer)
 * Bindings 3–5: directional shadow (depth texture, comparison sampler, params buffer)
 *
 * Both are packed into a single bind group because WebGPU limits bind groups to 4 (0–3).
 */
export class ShadowUniforms implements ISharedUniformBuffer {
  group: number;
  cloudBuffer: GPUBuffer;
  directionalBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // invViewMatrix (16) + worldSize, centerX, centerZ, shadowIntensity (4) = 20 floats
  private cloudData: Float32Array;
  // lightMVPFromView (16 floats)
  private directionalData: Float32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.cloudData = new Float32Array(20);
    this.directionalData = new Float32Array(16);
  }

  get buffer(): GPUBuffer {
    return this.cloudBuffer;
  }

  destroy(): void {
    this.cloudBuffer?.destroy();
    this.directionalBuffer?.destroy();
  }

  setNumInstances(_numInstances: number): void {}

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    // Cloud shadow params: invViewMatrix (mat4, 64 bytes) + worldSize/centerX/centerZ/intensity (4 floats, 16 bytes) = 80 bytes
    this.cloudBuffer = device.createBuffer({
      label: 'cloud shadow params',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Directional shadow params: lightMVPFromView (mat4x4f = 64 bytes)
    this.directionalBuffer = device.createBuffer({
      label: 'directional shadow params',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cloudShadowMap = renderer.cloudShadowMap;
    const directionalShadowMap = renderer.directionalShadowMap;

    if (!cloudShadowMap || !directionalShadowMap) {
      this.requiresBuild = true;
      return;
    }

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries: [
        // Cloud shadow (bindings 0–2)
        { binding: 0, resource: cloudShadowMap.createView() },
        { binding: 1, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 2, resource: { buffer: this.cloudBuffer } },
        // Directional shadow (bindings 3–5)
        { binding: 3, resource: directionalShadowMap.createView({ aspect: 'depth-only' }) },
        { binding: 4, resource: renderer.samplerManager.get('depth-comparison') },
        { binding: 5, resource: { buffer: this.directionalBuffer } },
      ],
    });
  }

  prepare(renderer: Renderer, camera: Camera, _meshes: IVisualComponent[]): void {
    const { device } = renderer;
    if (!this.cloudBuffer || !this.directionalBuffer || !this.bindGroup) return;

    // --- Cloud shadow ---
    const shadowRenderer = renderer.sky?.skyRenderer?.cloudShadowRenderer;
    if (shadowRenderer) {
      this.cloudData.set(camera.transform.matrixWorld.elements, 0);
      this.cloudData[16] = shadowRenderer.config.worldSize;
      this.cloudData[17] = camera.transform.position.x;
      this.cloudData[18] = camera.transform.position.z;
      this.cloudData[19] = renderer.sky.skyRenderer.fogIntensity;
      device.queue.writeBuffer(this.cloudBuffer, 0, this.cloudData.buffer);
    }

    // --- Directional shadow ---
    const dirShadowRenderer = renderer.directionalShadowRenderer;
    if (dirShadowRenderer) {
      // lightMVPFromView = lightVP * camera.matrixWorld (transforms view-space position to light clip space)
      _tempMat.multiplyMatrices(dirShadowRenderer.lightVP, camera.transform.matrixWorld);
      this.directionalData.set(_tempMat.elements, 0);
      device.queue.writeBuffer(this.directionalBuffer, 0, this.directionalData.buffer);
    }
  }
}
