import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// StandardParams layout (48 bytes, std140-compatible):
//   baseColorFactor   vec3f  offset 0  (12 bytes)
//   metallic          f32    offset 12 (4 bytes)
//   emissiveColor     vec3f  offset 16 (12 bytes)
//   roughness         f32    offset 28 (4 bytes)
//   ambientColor      vec3f  offset 32 (12 bytes)
//   emissiveIntensity f32    offset 44 (4 bytes)
//
// The two scalars are tucked into the vec3 padding slots rather than given rows
// of their own — a vec3f is aligned to 16 bytes either way, so this costs
// nothing and keeps the block at three rows.
const PARAMS_SIZE = 48;

/**
 * Uniforms for the metallic-roughness standard material.
 *
 * Deliberately the scalar half of glTF's material model only: baseColorFactor,
 * metallic and roughness are per-material constants here, and the maps that
 * make them vary across a surface — metallicRoughness and occlusion, including
 * ORM channel packing — arrive with #195. Base colour, normal and emissive maps
 * are wired up now because the pipeline already carries them.
 */
export class StandardMaterial implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  baseColorFactor: [number, number, number] = [1, 1, 1];
  /** 0 = dielectric, 1 = metal. Values between are only meaningful for a
   *  surface that is genuinely partly both, e.g. paint worn through to metal. */
  metallic: number = 0;
  /** Perceptual roughness, as glTF authors it — the shader squares it. */
  roughness: number = 0.5;
  emissiveColor: [number, number, number] = [1, 1, 1];
  emissiveIntensity: number = 0;
  /** Placeholder for IBL; #201 replaces this with the sky-captured ambient. */
  ambientColor: [number, number, number] = [0, 0, 0];

  private _baseColorTexture: GPUTexture;
  private _normalTexture: GPUTexture;
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

    // White rather than the grid Phong defaults to: glTF's default base colour
    // is white, so an untextured material is controlled purely by
    // baseColorFactor. White is also 255 in both colour spaces, so this 1x1
    // reading linear (#190) is not a mis-declaration.
    if (!this._baseColorTexture)
      this._baseColorTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
    if (!this._normalTexture)
      this._normalTexture =
        renderer.textureManager.get('flat-normal-1x1').gpuTexture;
    if (!this._emissiveTexture)
      this._emissiveTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
    if (!this._sampler) this._sampler = renderer.samplerManager.get('linear');

    if (this._paramsBuffer) this._paramsBuffer.destroy();
    this._paramsBuffer = device.createBuffer({
      label: 'standard material params',
      size: PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._writeParams(device);

    this.bindGroup = device.createBindGroup({
      label: 'standard material',
      layout: pipelineLayout,
      entries: [
        { binding: 0, resource: this._sampler },
        { binding: 1, resource: this._baseColorTexture.createView() },
        { binding: 2, resource: this._normalTexture.createView() },
        { binding: 3, resource: this._emissiveTexture.createView() },
        { binding: 4, resource: { buffer: this._paramsBuffer } },
      ],
    });

    this.requiresBuild = false;
  }

  private _writeParams(device: GPUDevice): void {
    this._paramsData[0] = this.baseColorFactor[0];
    this._paramsData[1] = this.baseColorFactor[1];
    this._paramsData[2] = this.baseColorFactor[2];
    this._paramsData[3] = this.metallic;
    this._paramsData[4] = this.emissiveColor[0];
    this._paramsData[5] = this.emissiveColor[1];
    this._paramsData[6] = this.emissiveColor[2];
    this._paramsData[7] = this.roughness;
    this._paramsData[8] = this.ambientColor[0];
    this._paramsData[9] = this.ambientColor[1];
    this._paramsData[10] = this.ambientColor[2];
    this._paramsData[11] = this.emissiveIntensity;
    device.queue.writeBuffer(
      this._paramsBuffer,
      0,
      this._paramsData as ArrayBufferView<ArrayBuffer>
    );
  }

  set baseColorTexture(texture: GPUTexture) {
    this._baseColorTexture = texture;
    this.requiresBuild = true;
  }

  get baseColorTexture(): GPUTexture {
    return this._baseColorTexture;
  }

  set normalTexture(texture: GPUTexture) {
    this._normalTexture = texture;
    this.requiresBuild = true;
  }

  get normalTexture(): GPUTexture {
    return this._normalTexture;
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
