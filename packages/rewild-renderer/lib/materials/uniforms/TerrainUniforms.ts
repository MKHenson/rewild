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

  specularColor: [number, number, number] = [1, 1, 1];
  shininess: number = 32;
  ambientColor: [number, number, number] = [0, 0, 0];

  private _albedoTexture: GPUTexture;
  private _texture: GPUTexture;
  private _sampler: GPUSampler;
  private _seamlessSampler: GPUSampler;
  private _normalMap: GPUTexture;
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
    if (!this._albedoTexture)
      this._albedoTexture = renderer.textureManager.get('grid-data').gpuTexture;
    if (!this._sampler) this._sampler = renderer.samplerManager.get('linear');
    if (!this._seamlessSampler)
      this._seamlessSampler = renderer.samplerManager.get('linear');
    if (!this._normalMap)
      this._normalMap =
        renderer.textureManager.get('flat-normal-1x1').gpuTexture;
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
        { binding: 2, resource: this._albedoTexture.createView() },
        { binding: 3, resource: this._seamlessSampler },
        { binding: 4, resource: this._normalMap.createView() },
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

  set albedoTexture(texture: GPUTexture) {
    this._albedoTexture = texture;
    this.requiresBuild = true;
  }

  get albedoTexture(): GPUTexture {
    return this._albedoTexture;
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

  set normalMap(texture: GPUTexture) {
    this._normalMap = texture;
    this.requiresBuild = true;
  }

  get normalMap(): GPUTexture {
    return this._normalMap;
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
