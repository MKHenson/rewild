import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';

// StandardParams layout (80 bytes, std140-compatible):
//   baseColorFactor   vec4f  offset 0  (16 bytes)
//   emissiveColor     vec3f  offset 16 (12 bytes)
//   roughness         f32    offset 28 (4 bytes)
//   ambientColor      vec3f  offset 32 (12 bytes)
//   emissiveStrength  f32    offset 44 (4 bytes)
//   metallic          f32    offset 48 (4 bytes)
//   occlusionStrength f32    offset 52 (4 bytes)
//   normalScale       f32    offset 56 (4 bytes)
//   alphaCutoff       f32    offset 60 (4 bytes)
//   alphaMode         u32    offset 64 (4 bytes)
//   _pad0.._pad2      f32    offset 68 (12 bytes)
//
// The scalars are tucked into the vec3 padding slots rather than given rows of
// their own — a vec3f is aligned to 16 bytes either way, so this costs nothing.
const PARAMS_SIZE = 80;

/** glTF's alphaMode. The shader compares against these, so the numbering is
 *  shared with ALPHA_MODE_* in standard.wgsl. */
export const ALPHA_MODES = ['OPAQUE', 'MASK', 'BLEND'] as const;
export type AlphaMode = typeof ALPHA_MODES[number];

/**
 * Uniforms for the metallic-roughness standard material — glTF's full texture
 * set: base colour, metallic-roughness, normal, occlusion and emissive.
 *
 * Metallic-roughness and occlusion are separate slots that may point at the
 * same texture, which is exactly what an ORM atlas is (occlusion R, roughness
 * G, metallic B). That is glTF's own model, and it means an ORM texture, a
 * separate AO map, or neither all work without a packing mode to set.
 *
 * Alpha and double-sidedness are configured on StandardPass, not here — they
 * choose pipeline state as well as shader behaviour, and the two have to agree.
 */
export class StandardMaterial implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  /** RGBA. The fourth component is glTF's opacity factor: MASK tests it (times
   *  the texture's and the vertex colour's alpha) against alphaCutoff, BLEND
   *  blends with it, and OPAQUE ignores it entirely, as the spec requires. */
  baseColorFactor: [number, number, number, number] = [1, 1, 1, 1];
  /** 0 = dielectric, 1 = metal. Values between are only meaningful for a
   *  surface that is genuinely partly both, e.g. paint worn through to metal.
   *  Multiplied by the B channel of metallicRoughnessTexture. */
  metallic: number = 0;
  /** Perceptual roughness, as glTF authors it — the shader squares it.
   *  Multiplied by the G channel of metallicRoughnessTexture. */
  roughness: number = 0.5;
  /** glTF's emissiveFactor. Black by default, which is what makes
   *  emissiveStrength safe to default to 1. */
  emissiveColor: [number, number, number] = [0, 0, 0];
  /** KHR_materials_emissive_strength — a multiplier on emissiveFactor that is
   *  allowed past 1, which is the only way to author a surface that blooms.
   *  Kept separate from emissiveColor rather than folded into it because glTF
   *  clamps the factor to [0,1] and puts all the range here. */
  emissiveStrength: number = 1;
  /** Placeholder for IBL; #201 replaces this with the sky-captured ambient. */
  ambientColor: [number, number, number] = [0, 0, 0];
  /** How far the occlusion map is allowed to darken indirect light: 0 ignores
   *  the map entirely, 1 applies it in full. glTF's occlusionTexture.strength.
   *  Note occlusion only affects the indirect term, so it is invisible while
   *  ambientColor is black. */
  occlusionStrength: number = 1;
  /** How far the normal map is allowed to tilt the shading normal: 0 flattens
   *  it to the geometric normal, 1 is the map as authored, above 1 exaggerates.
   *  glTF's normalTexture.scale. */
  normalScale: number = 1;
  /** Only read when alphaMode is MASK: below this the fragment is discarded,
   *  at or above it the fragment is fully opaque. Never a partial value — that
   *  is what separates MASK from BLEND. */
  alphaCutoff: number = 0.5;
  /**
   * Set through StandardPass, not here — it also selects the pipeline's blend
   * and depth-write state, and the two must agree. The shader needs it because
   * the pipeline alone cannot force alpha to 1 for OPAQUE or discard for MASK.
   */
  alphaMode: AlphaMode = 'OPAQUE';

  private _baseColorTexture: GPUTexture;
  private _normalTexture: GPUTexture;
  private _metallicRoughnessTexture: GPUTexture;
  private _occlusionTexture: GPUTexture;
  private _emissiveTexture: GPUTexture;
  private _sampler: GPUSampler;
  private _paramsBuffer: GPUBuffer;
  private _paramsData: Float32Array = new Float32Array(PARAMS_SIZE / 4);
  // alphaMode is the one u32 in the block; this aliases the same bytes so it
  // can be written without reinterpreting an integer as a float.
  private _paramsDataU32: Uint32Array = new Uint32Array(
    this._paramsData.buffer
  );

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
    // White in both slots is glTF's default and a genuine no-op: roughness and
    // metallic fall through to their factors, and occlusion of 1.0 is "nothing
    // is occluded".
    if (!this._metallicRoughnessTexture)
      this._metallicRoughnessTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
    if (!this._occlusionTexture)
      this._occlusionTexture =
        renderer.textureManager.get('white-1x1').gpuTexture;
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
        { binding: 3, resource: this._metallicRoughnessTexture.createView() },
        { binding: 4, resource: this._occlusionTexture.createView() },
        { binding: 5, resource: this._emissiveTexture.createView() },
        { binding: 6, resource: { buffer: this._paramsBuffer } },
      ],
    });

    this.requiresBuild = false;
  }

  private _writeParams(device: GPUDevice): void {
    this._paramsData[0] = this.baseColorFactor[0];
    this._paramsData[1] = this.baseColorFactor[1];
    this._paramsData[2] = this.baseColorFactor[2];
    this._paramsData[3] = this.baseColorFactor[3];
    this._paramsData[4] = this.emissiveColor[0];
    this._paramsData[5] = this.emissiveColor[1];
    this._paramsData[6] = this.emissiveColor[2];
    this._paramsData[7] = this.roughness;
    this._paramsData[8] = this.ambientColor[0];
    this._paramsData[9] = this.ambientColor[1];
    this._paramsData[10] = this.ambientColor[2];
    this._paramsData[11] = this.emissiveStrength;
    this._paramsData[12] = this.metallic;
    this._paramsData[13] = this.occlusionStrength;
    this._paramsData[14] = this.normalScale;
    this._paramsData[15] = this.alphaCutoff;
    this._paramsDataU32[16] = ALPHA_MODES.indexOf(this.alphaMode);
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

  /** Roughness in G, metallic in B. Point this and occlusionTexture at the same
   *  texture to use a packed ORM atlas. */
  set metallicRoughnessTexture(texture: GPUTexture) {
    this._metallicRoughnessTexture = texture;
    this.requiresBuild = true;
  }

  get metallicRoughnessTexture(): GPUTexture {
    return this._metallicRoughnessTexture;
  }

  /** Occlusion in R. */
  set occlusionTexture(texture: GPUTexture) {
    this._occlusionTexture = texture;
    this.requiresBuild = true;
  }

  get occlusionTexture(): GPUTexture {
    return this._occlusionTexture;
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
