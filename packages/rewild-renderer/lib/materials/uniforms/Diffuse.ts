import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

export class Diffuse implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  private _texture: GPUTexture;
  private _sampler: GPUSampler;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
  }

  destroy(): void {}

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    if (!this._texture)
      this._texture = renderer.textureManager.get('grid-data').gpuTexture;
    if (!this._sampler) this._sampler = renderer.samplerManager.get('linear');

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: this._sampler,
        },
        {
          binding: 1,
          resource: this._texture.createView(),
        },
      ],
    });

    this.requiresBuild = false;
  }

  set texture(texture: GPUTexture) {
    this._texture = texture;
    this.requiresBuild = true;
  }

  get texture(): GPUTexture {
    return this._texture;
  }

  set sampler(sampler: GPUSampler) {
    this._sampler = sampler;
    this.requiresBuild = true;
  }

  get sampler(): GPUSampler {
    return this._sampler;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
