import { Matrix4 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { IVisualComponent } from '../../../types/interfaces';
import { NUM_CASCADES } from '../../renderers/shadow/DirectionalShadowRenderer';

const _tempMat = new Matrix4();

/**
 * Manages bind group 3 — all shadow resources for a material pass.
 *
 * Bindings 0–2: cloud shadow (transmittance map, linear sampler, params buffer)
 * Bindings 3–5: shadow atlas (depth texture, comparison sampler, directional params buffer)
 * Binding  6:   spot light shadow params buffer
 *
 * All packed into a single bind group because WebGPU limits bind groups to 4 (0–3).
 */
export class ShadowUniforms implements ISharedUniformBuffer {
  group: number;
  cloudBuffer: GPUBuffer;
  directionalBuffer: GPUBuffer;
  spotBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // invViewMatrix (16) + worldSize, centerX, centerZ, shadowIntensity (4) = 20 floats
  private cloudData: Float32Array;
  // 3 × lightMVPFromView (mat4x4f = 16 floats each) + cascadeSplits (vec4f = 4 floats) = 52 floats / 208 bytes
  private directionalData: Float32Array;
  // lightMVPFromView (mat4x4f = 16 floats) + lightIndex (u32) + hasSpotShadow (u32) + 2× pad = 80 bytes
  private spotData: ArrayBuffer;
  private spotFloats: Float32Array;
  private spotInts: Uint32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.cloudData = new Float32Array(20);
    this.directionalData = new Float32Array(NUM_CASCADES * 16 + 4);
    this.spotData = new ArrayBuffer(80);
    this.spotFloats = new Float32Array(this.spotData);
    this.spotInts = new Uint32Array(this.spotData);
  }

  get buffer(): GPUBuffer {
    return this.cloudBuffer;
  }

  destroy(): void {
    this.cloudBuffer?.destroy();
    this.directionalBuffer?.destroy();
    this.spotBuffer?.destroy();
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

    // Directional shadow params: 3 × lightMVPFromView (192 bytes) + cascadeSplits vec4f (16 bytes) = 208 bytes
    this.directionalBuffer = device.createBuffer({
      label: 'directional shadow params',
      size: 208,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Spot light shadow params: lightMVPFromView (64 bytes) + lightIndex u32 + hasSpotShadow u32 + 2× pad = 80 bytes
    this.spotBuffer = device.createBuffer({
      label: 'spot light shadow params',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cloudShadowMap = renderer.cloudShadowMap;
    const shadowAtlas = renderer.shadowAtlas;

    if (!cloudShadowMap || !shadowAtlas) {
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
        // Shadow atlas — directional cascades + spot quadrant (bindings 3–5)
        { binding: 3, resource: shadowAtlas.createView({ aspect: 'depth-only' }) },
        { binding: 4, resource: renderer.samplerManager.get('depth-comparison') },
        { binding: 5, resource: { buffer: this.directionalBuffer } },
        // Spot light shadow params (binding 6)
        { binding: 6, resource: { buffer: this.spotBuffer } },
      ],
    });
  }

  prepare(renderer: Renderer, camera: Camera, _meshes: IVisualComponent[]): void {
    const { device } = renderer;
    if (!this.cloudBuffer || !this.directionalBuffer || !this.spotBuffer || !this.bindGroup) return;

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

    // --- Directional shadow (CSM) ---
    const dirShadowRenderer = renderer.directionalShadowRenderer;
    if (dirShadowRenderer) {
      // lightMVPFromView[i] = lightVPs[i] * camera.matrixWorld
      // Transforms a view-space position into cascade i's light clip space.
      for (let i = 0; i < NUM_CASCADES; i++) {
        _tempMat.multiplyMatrices(dirShadowRenderer.lightVPs[i], camera.transform.matrixWorld);
        this.directionalData.set(_tempMat.elements, i * 16);
      }
      this.directionalData.set(dirShadowRenderer.cascadeSplitDistances, NUM_CASCADES * 16);
      device.queue.writeBuffer(this.directionalBuffer, 0, this.directionalData.buffer);
    }

    // --- Spot light shadow ---
    const spotRenderer = renderer.spotLightShadowRenderer;
    if (spotRenderer?.hasSpotShadow) {
      // lightMVPFromView = lightVP * camera.matrixWorld
      // Transforms a view-space position into spot light clip space.
      _tempMat.multiplyMatrices(spotRenderer.lightVP, camera.transform.matrixWorld);
      this.spotFloats.set(_tempMat.elements, 0);
      this.spotInts[16] = renderer.shadowCastingSpotLightIndex;
      this.spotInts[17] = 1; // hasSpotShadow = true
      this.spotInts[18] = 0;
      this.spotInts[19] = 0;
    } else {
      this.spotInts[17] = 0; // hasSpotShadow = false — shader skips PCF
    }
    device.queue.writeBuffer(this.spotBuffer, 0, this.spotData);
  }
}
