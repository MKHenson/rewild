import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { IVisualComponent } from '../../../types/interfaces';

export class CloudShadow implements ISharedUniformBuffer {
  group: number;
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // invViewMatrix (16) + worldSize, centerX, centerZ, shadowIntensity (4)
  private shadowData: Float32Array;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.shadowData = new Float32Array(20);
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
  }

  setNumInstances(_numInstances: number): void {}

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    // 16 floats (mat4x4) + 4 floats (params) = 80 bytes
    this.buffer = device.createBuffer({
      label: 'cloud shadow params',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shadowMap = renderer.cloudShadowMap;
    if (!shadowMap) {
      // Shadow map not yet available - defer build to next frame
      this.requiresBuild = true;
      return;
    }

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: shadowMap.createView(),
        },
        {
          binding: 1,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        {
          binding: 2,
          resource: { buffer: this.buffer },
        },
      ],
    });
  }

  prepare(
    renderer: Renderer,
    camera: Camera,
    _meshes: IVisualComponent[]
  ): void {
    const { device } = renderer;

    if (!this.buffer || !this.bindGroup) return;

    const shadowRenderer =
      renderer.atmosphere?.skyRenderer?.cloudShadowRenderer;
    if (!shadowRenderer) return;

    // Inverse view matrix (camera world matrix) for view→world conversion
    this.shadowData.set(camera.transform.matrixWorld.elements, 0);

    this.shadowData[16] = shadowRenderer.config.worldSize;
    this.shadowData[17] = camera.transform.position.x;
    this.shadowData[18] = camera.transform.position.z;
    this.shadowData[19] = 0.7; // shadow intensity

    device.queue.writeBuffer(this.buffer, 0, this.shadowData.buffer);
  }
}
