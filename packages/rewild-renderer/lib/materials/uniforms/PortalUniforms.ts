import { Color } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { IVisualComponent } from '../../../types/interfaces';
import { Camera } from '../../core/Camera';

const FLOATS = 24;

/**
 * The portal's look and the cube it shows. With no cube set it shows the sky's
 * environment map, and draws nothing until the sky has one.
 */
export class PortalUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild = true;
  buffer: GPUBuffer;

  tint = new Color(0.45, 0.7, 1.0);
  glow = 1.0;
  lensing = 1.0;

  private _view: GPUTexture | null = null;
  private boundTexture: GPUTexture | null = null;
  private values = new Float32Array(FLOATS);

  constructor(group: number) {
    this.group = group;
  }

  /** A cube of a tonemapped bake, or null for the sky. */
  set view(texture: GPUTexture | null) {
    this._view = texture;
    this.requiresBuild = true;
  }

  get view(): GPUTexture | null {
    return this._view;
  }

  /** Flags a rebuild when the sky has replaced the cube this is bound to. */
  syncTexture(renderer: Renderer) {
    const texture = this._view ?? renderer.skyEnvironmentMap;
    if (texture !== this.boundTexture) this.requiresBuild = true;
  }

  destroy(): void {
    this.buffer?.destroy();
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    if (!this.buffer)
      this.buffer = device.createBuffer({
        label: 'portal uniforms',
        size: FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

    const texture = this._view ?? renderer.skyEnvironmentMap;
    this.boundTexture = texture;
    if (!texture) {
      this.bindGroup = null!;
      return;
    }

    this.bindGroup = device.createBindGroup({
      label: 'portal bind group',
      layout: pipelineLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        {
          binding: 1,
          resource: renderer.samplerManager.getOrCreate(device, {
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
          }),
        },
        { binding: 2, resource: texture.createView({ dimension: 'cube' }) },
      ],
    });
  }

  setNumInstances(): void {}

  prepare(renderer: Renderer, camera: Camera, _: IVisualComponent[]): void {
    const values = this.values;
    values.set(camera.transform.matrixWorld.elements, 0);
    values[16] = this.tint.r;
    values[17] = this.tint.g;
    values[18] = this.tint.b;
    values[19] = this.glow;
    values[20] = renderer.totalDeltaTime / 1000;
    values[21] = camera.exposure;
    values[22] = this._view ? 1 : 0;
    values[23] = this.lensing;
    renderer.device.queue.writeBuffer(
      this.buffer,
      0,
      values.buffer,
      values.byteOffset,
      values.byteLength
    );
  }
}
