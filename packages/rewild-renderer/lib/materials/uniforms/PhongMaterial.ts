import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// PhongParams layout (48 bytes, std140-compatible):
//   specularColor    vec3f  offset 0  (12 bytes)
//   shininess        f32    offset 12 (4 bytes)
//   emissiveColor    vec3f  offset 16 (12 bytes)
//   emissiveIntensity f32   offset 28 (4 bytes)
//   ambientColor     vec3f  offset 32 (12 bytes)
//   _pad             f32    offset 44 (4 bytes)
const PARAMS_SIZE = 48;

export class PhongMaterial implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  specularColor: [number, number, number] = [0.04, 0.04, 0.04];
  shininess: number = 32;
  emissiveColor: [number, number, number] = [1, 1, 1];
  emissiveIntensity: number = 0;
  ambientColor: [number, number, number] = [0, 0, 0];

  private _diffuseTexture: GPUTexture;
  private _normalTexture: GPUTexture;
  private _specularTexture: GPUTexture;
  private _emissiveTexture: GPUTexture;
  private _sampler: GPUSampler;
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

    if (!this._diffuseTexture)
      this._diffuseTexture =
        renderer.textureManager.get('grid-data').gpuTexture;
    if (!this._normalTexture)
      this._normalTexture =
        renderer.textureManager.get('flat-normal-1x1').gpuTexture;
    if (!this._specularTexture)
      this._specularTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
    if (!this._emissiveTexture)
      this._emissiveTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
    if (!this._sampler) this._sampler = renderer.samplerManager.get('linear');

    if (this._paramsBuffer) this._paramsBuffer.destroy();
    this._paramsBuffer = device.createBuffer({
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._writeParams(device);

    this.bindGroup = device.createBindGroup({
      label: 'phong material',
      layout: pipelineLayout,
      entries: [
        { binding: 0, resource: this._sampler },
        { binding: 1, resource: this._diffuseTexture.createView() },
        { binding: 2, resource: this._normalTexture.createView() },
        { binding: 3, resource: this._specularTexture.createView() },
        { binding: 4, resource: this._emissiveTexture.createView() },
        { binding: 5, resource: { buffer: this._paramsBuffer } },
      ],
    });

    this.requiresBuild = false;
  }

  private _writeParams(device: GPUDevice): void {
    this._paramsData[0] = this.specularColor[0];
    this._paramsData[1] = this.specularColor[1];
    this._paramsData[2] = this.specularColor[2];
    this._paramsData[3] = this.shininess;
    this._paramsData[4] = this.emissiveColor[0];
    this._paramsData[5] = this.emissiveColor[1];
    this._paramsData[6] = this.emissiveColor[2];
    this._paramsData[7] = this.emissiveIntensity;
    this._paramsData[8] = this.ambientColor[0];
    this._paramsData[9] = this.ambientColor[1];
    this._paramsData[10] = this.ambientColor[2];
    this._paramsData[11] = 0;
    device.queue.writeBuffer(
      this._paramsBuffer,
      0,
      this._paramsData as ArrayBufferView<ArrayBuffer>
    );
  }

  set diffuseTexture(texture: GPUTexture) {
    this._diffuseTexture = texture;
    this.requiresBuild = true;
  }

  get diffuseTexture(): GPUTexture {
    return this._diffuseTexture;
  }

  set normalTexture(texture: GPUTexture) {
    this._normalTexture = texture;
    this.requiresBuild = true;
  }

  get normalTexture(): GPUTexture {
    return this._normalTexture;
  }

  set specularTexture(texture: GPUTexture) {
    this._specularTexture = texture;
    this.requiresBuild = true;
  }

  get specularTexture(): GPUTexture {
    return this._specularTexture;
  }

  set emissiveTexture(texture: GPUTexture) {
    this._emissiveTexture = texture;
    this.requiresBuild = true;
  }

  get emissiveTexture(): GPUTexture {
    return this._emissiveTexture;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
