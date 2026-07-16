import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// TerrainParams layout (32 bytes, std140-compatible):
//   specularColor  vec3f  offset 0  (12 bytes)
//   shininess      f32    offset 12 (4 bytes)
//   ambientColor   vec3f  offset 16 (12 bytes)
//   _pad           f32    offset 28 (4 bytes)
const PARAMS_SIZE = 32;

export class TerrainUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  specularColor: [number, number, number] = [0.04, 0.04, 0.04];
  shininess: number = 32;
  ambientColor: [number, number, number] = [0, 0, 0];

  // Albedo and normal are held as views, not textures: they are single-layer
  // views into the terrain texture arrays, and a default view of an array
  // texture is `2d-array`, which will not bind to the shader's `texture_2d`.
  private _albedoView: GPUTextureView;
  private _normalView: GPUTextureView;
  private _texture: GPUTexture;
  private _sampler: GPUSampler;
  private _seamlessSampler: GPUSampler;
  private _specularMap: GPUTexture;
  private _paramsBuffer: GPUBuffer;
  private _paramsData: Float32Array = new Float32Array(PARAMS_SIZE / 4);

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
  }

  destroy(): void {
    if (this._paramsBuffer) this._paramsBuffer.destroy();
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;

    if (!this._texture)
      this._texture = renderer.textureManager.get('grid-data').gpuTexture;
    if (!this._albedoView)
      this._albedoView = renderer.textureManager
        .get('grid-data')
        .gpuTexture.createView();
    if (!this._sampler) this._sampler = renderer.samplerManager.get('linear');
    if (!this._seamlessSampler)
      this._seamlessSampler = renderer.samplerManager.get('linear');
    if (!this._normalView)
      this._normalView = renderer.textureManager
        .get('flat-normal-1x1')
        .gpuTexture.createView();
    if (!this._specularMap)
      this._specularMap = renderer.textureManager.get('white-1x1').gpuTexture;

    if (this._paramsBuffer) this._paramsBuffer.destroy();
    this._paramsBuffer = device.createBuffer({
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._writeParams(device);

    this.bindGroup = device.createBindGroup({
      label: 'terrain textures',
      layout: pipelineLayout,
      entries: [
        { binding: 0, resource: this._sampler },
        { binding: 1, resource: this._texture.createView() },
        { binding: 2, resource: this._albedoView },
        { binding: 3, resource: this._seamlessSampler },
        { binding: 4, resource: this._normalView },
        { binding: 5, resource: this._specularMap.createView() },
        { binding: 6, resource: { buffer: this._paramsBuffer } },
      ],
    });

    this.requiresBuild = false;
  }

  private _writeParams(device: GPUDevice): void {
    this._paramsData[0] = this.specularColor[0];
    this._paramsData[1] = this.specularColor[1];
    this._paramsData[2] = this.specularColor[2];
    this._paramsData[3] = this.shininess;
    this._paramsData[4] = this.ambientColor[0];
    this._paramsData[5] = this.ambientColor[1];
    this._paramsData[6] = this.ambientColor[2];
    this._paramsData[7] = 0;
    device.queue.writeBuffer(
      this._paramsBuffer,
      0,
      this._paramsData as ArrayBufferView<ArrayBuffer>
    );
  }

  set texture(texture: GPUTexture) {
    this._texture = texture;
    this.requiresBuild = true;
  }

  get texture(): GPUTexture {
    return this._texture;
  }

  set albedoView(view: GPUTextureView) {
    this._albedoView = view;
    this.requiresBuild = true;
  }

  get albedoView(): GPUTextureView {
    return this._albedoView;
  }

  set sampler(sampler: GPUSampler) {
    this._sampler = sampler;
    this.requiresBuild = true;
  }

  get sampler(): GPUSampler {
    return this._sampler;
  }

  get seamlessSampler(): GPUSampler {
    return this._seamlessSampler;
  }

  set seamlessSampler(sampler: GPUSampler) {
    this._seamlessSampler = sampler;
    this.requiresBuild = true;
  }

  set normalView(view: GPUTextureView) {
    this._normalView = view;
    this.requiresBuild = true;
  }

  get normalView(): GPUTextureView {
    return this._normalView;
  }

  set specularMap(texture: GPUTexture) {
    this._specularMap = texture;
    this.requiresBuild = true;
  }

  get specularMap(): GPUTexture {
    return this._specularMap;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
