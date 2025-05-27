import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { samplerManager } from '../../textures/SamplerManager';
import { textureManager } from '../../textures/TextureManager';

export class TerrainUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresUpdate: boolean;

  private _albedoTexture: GPUTexture;
  private _texture: GPUTexture;
  private _sampler: GPUSampler;
  private _seamlessSampler: GPUSampler;

  constructor(group: number) {
    this.group = group;
    this.requiresUpdate = true;
  }

  destroy(): void {}

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    if (!this._texture)
      this._texture = textureManager.get('grid-data').gpuTexture;
    if (!this._albedoTexture)
      this._albedoTexture = textureManager.get('grid-data').gpuTexture;
    if (!this._sampler) this._sampler = samplerManager.get('linear');
    if (!this._seamlessSampler)
      this._seamlessSampler = samplerManager.get('linear');

    this.bindGroup = device.createBindGroup({
      label: 'terrain textures',
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
        {
          binding: 2,
          resource: this._albedoTexture.createView(),
        },
        {
          binding: 3,
          resource: this._seamlessSampler,
        },
      ],
    });

    this.requiresUpdate = false;
  }

  set texture(texture: GPUTexture) {
    this._texture = texture;
    this.requiresUpdate = true;
  }

  get texture(): GPUTexture {
    return this._texture;
  }

  set albedoTexture(texture: GPUTexture) {
    this._albedoTexture = texture;
    this.requiresUpdate = true;
  }

  get albedoTexture(): GPUTexture {
    return this._albedoTexture;
  }

  set sampler(sampler: GPUSampler) {
    this._sampler = sampler;
    this.requiresUpdate = true;
  }

  get sampler(): GPUSampler {
    return this._sampler;
  }

  get seamlessSampler(): GPUSampler {
    return this._seamlessSampler;
  }

  set seamlessSampler(sampler: GPUSampler) {
    this._seamlessSampler = sampler;
    this.requiresUpdate = true;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
