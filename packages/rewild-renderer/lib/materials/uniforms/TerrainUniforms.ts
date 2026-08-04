import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { MAX_SPLAT_LAYERS } from '../../renderers/terrain/Biomes';

// TerrainParams layout (432 bytes, std140-compatible) — must match the struct
// in terrain.wgsl:
//   specularColor    vec3f           offset 0   (12 bytes)
//   shininess        f32             offset 12  (4 bytes)
//   ambientColor     vec3f           offset 16  (12 bytes)
//   detailFadeStart  f32             offset 28  (4 bytes)
//   detailFadeEnd    f32             offset 32  (4 bytes)
//   noiseScale       f32             offset 36  (4 bytes)
//   heightBlendDepth f32             offset 40  (4 bytes)
//   _pad             f32             offset 44  (4 bytes)
//   layers           array<vec4f,24> offset 48  (384 bytes)
//
// `layers` starts at 48 because a uniform array of vec4f needs 16-byte
// alignment; 40 + 8 padding is what gets it there. Three vec4f per splat
// channel, MAX_SPLAT_LAYERS channels:
//   [slot*3    ] = (layerIndex, uvScale, macroUvScale, specular)
//   [slot*3 + 1] = (normalYSign, heightScale, shininess, blendDepth)
//   [slot*3 + 2] = (macroLayerIndex, macroNormalYSign, macroStrength, _pad)
const PARAMS_SIZE = 48 + MAX_SPLAT_LAYERS * 3 * 16;
const LAYERS_OFFSET_FLOATS = 48 / 4;
const FLOATS_PER_LAYER = 12;

export interface TerrainLayerParams {
  layerIndex: number;
  uvScale: number;
  // 0 ⇒ no macro normal for this material.
  macroUvScale: number;
  specular: number;
  // +1 for a DirectX-convention normal map, -1 for an OpenGL one.
  normalYSign: number;
  // Depth of the parallax-occlusion volume, in tile-UV units. 0 ⇒ no parallax.
  heightScale: number;
  // Blinn-Phong specular exponent (gloss). Higher ⇒ tighter, sharper highlight.
  shininess: number;
  // Width of this material's transition to its neighbours, in blend-score
  // units. Small ⇒ a hard interlocking edge; large ⇒ a soft crossfade.
  blendDepth: number;
  // Normal-array layer the macro normal samples. Usually the same as
  // layerIndex, but a material may borrow a coarser material's normal map
  // (TerrainMaterial.macroNormalFrom) — hence a separate index.
  macroLayerIndex: number;
  // Green-channel sign of the *macro* map, which belongs to whichever material
  // it came from and so need not match normalYSign.
  macroNormalYSign: number;
  // Macro-normal amplitude: 0 flat, 1 the source map's full tilt.
  macroStrength: number;
}

export class TerrainUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // Master gain on the specular highlight (tints it slightly warm so sun-glints
  // read golden). This multiplies every layer's own `specular`, so it is the
  // overall ceiling: at 0.04 (a dielectric F0) no material can glint no matter
  // its shininess — hence the higher value now that gloss is per-material.
  specularColor: [number, number, number] = [0.5, 0.5, 0.45];
  // Legacy global gloss. Terrain now blends shininess per-fragment from its
  // materials (see getClimateLayerParams), so this is unused by terrain lighting
  // and kept only for the uniform layout.
  shininess: number = 32;

  // Sky fill. Added outside the shadow terms, so it is what a surface facing
  // away from the sun — or inside a shadow — still receives; at zero those
  // areas render pure black, since nothing else lights them.
  //
  // Tinted blue because outdoors the fill *is* the sky. Kept modest because
  // this is a flat add: a fully lit surface gets diffuse (up to 1.0) plus this
  // on top, so raising it brightens the lit terrain as well as the shadows,
  // and daylight terrain is already close to saturating.
  ambientColor: [number, number, number] = [0.1, 0.11, 0.14];

  // Where the detail normal starts and finishes fading out, in view-space
  // metres. Past detailFadeEnd only the macro normal remains — which is the
  // point: the detail's mips have averaged to flat by then anyway.
  detailFadeStart: number = 150;
  detailFadeEnd: number = 200;

  // Size of the no-tile offset regions, as a fraction of each layer's own tile
  // — it multiplies scaledUV, so it tracks the material's tiling rather than
  // the world.
  //
  // The region size follows directly from the noise texture's own feature
  // period: smooth-noise-256 is a 16-cell grid, so a feature spans 1/16 UV and
  // one region covers (1/16) / noiseScale *tiles*. That ratio is the whole
  // ballgame — inside one region the two offsets are fixed, so the texture
  // repeats there untouched. At 0.005 a region was 12.5 tiles wide (200 m at
  // uvScale 30) and the repeat was plainly visible within it. ~3 tiles is
  // Inigo Quilez's figure for the technique and reads correctly here.
  //
  // Pushing much past this is the other failure mode: regions smaller than a
  // tile turn the crossfade itself into the dominant pattern, so the offsets
  // read as blotches rather than hiding the repeat.
  noiseScale: number = 0.02;

  // Fallback transition width for the height-aware layer blend. Terrain now
  // takes this per-material from the winning layer (TerrainMaterial.blendDepth)
  // so stone can interlock while litter and sand intermingle; this is only what
  // an unpopulated layer slot is given, and the uniform layout's original home
  // for the value.
  heightBlendDepth: number = 0.2;

  layers: TerrainLayerParams[] = [];

  // Albedo and normal are held as views, not textures: they are views into the
  // terrain texture arrays, and the shader declares texture_2d_array, so the
  // view dimension has to be chosen explicitly by the caller.
  private _albedoView: GPUTextureView;
  private _normalView: GPUTextureView;
  private _armView: GPUTextureView;
  private _heightView: GPUTextureView;
  // Palette channels 0-3 and 4-7. Two RGBA8 textures rather than one, because
  // that is all a texel holds; see MAX_SPLAT_LAYERS.
  private _splatTexture: GPUTexture;
  private _splatTextureExt: GPUTexture;
  private _noiseTexture: GPUTexture;
  private _splatSampler: GPUSampler;
  private _seamlessSampler: GPUSampler;
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

    if (!this._splatTexture)
      this._splatTexture = renderer.textureManager.get('grid-data').gpuTexture;
    if (!this._splatTextureExt)
      this._splatTextureExt =
        renderer.textureManager.get('grid-data').gpuTexture;
    // Must be the *smooth* field, not `data-rgba-noise-256`: that one is white
    // noise, and the shader floors this into a region index.
    if (!this._noiseTexture)
      this._noiseTexture =
        renderer.textureManager.get('smooth-noise-256').gpuTexture;
    if (!this._splatSampler)
      this._splatSampler = renderer.samplerManager.get('linear-clamped');
    if (!this._seamlessSampler)
      this._seamlessSampler = renderer.samplerManager.get('linear');
    if (!this._albedoView)
      this._albedoView = renderer.textureManager
        .get('grid-data')
        .gpuTexture.createView({ dimension: '2d-array' });
    if (!this._normalView)
      this._normalView = renderer.textureManager
        .get('flat-normal-1x1')
        .gpuTexture.createView({ dimension: '2d-array' });
    // white-1x1 ⇒ the ARM green channel reads 1 ⇒ roughness 1 ⇒ zero specular,
    // the safe fallback before the real ARM array is bound.
    if (!this._armView)
      this._armView = renderer.textureManager
        .get('white-1x1')
        .gpuTexture.createView({ dimension: '2d-array' });
    // flat-normal-1x1's red channel is 0.5 — the shader centres height on 0.5,
    // so this reads as zero displacement until the real height array is bound.
    if (!this._heightView)
      this._heightView = renderer.textureManager
        .get('flat-normal-1x1')
        .gpuTexture.createView({ dimension: '2d-array' });

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
        { binding: 0, resource: this._splatSampler },
        { binding: 1, resource: this._splatTexture.createView() },
        { binding: 2, resource: this._albedoView },
        { binding: 3, resource: this._seamlessSampler },
        { binding: 4, resource: this._normalView },
        { binding: 5, resource: this._noiseTexture.createView() },
        { binding: 6, resource: { buffer: this._paramsBuffer } },
        { binding: 7, resource: this._armView },
        { binding: 8, resource: this._heightView },
        { binding: 9, resource: this._splatTextureExt.createView() },
      ],
    });

    this.requiresBuild = false;
  }

  private _writeParams(device: GPUDevice): void {
    const data = this._paramsData;
    data[0] = this.specularColor[0];
    data[1] = this.specularColor[1];
    data[2] = this.specularColor[2];
    data[3] = this.shininess;
    data[4] = this.ambientColor[0];
    data[5] = this.ambientColor[1];
    data[6] = this.ambientColor[2];
    data[7] = this.detailFadeStart;
    data[8] = this.detailFadeEnd;
    data[9] = this.noiseScale;
    data[10] = this.heightBlendDepth;
    data[11] = 0; // _pad

    // Channels the palette does not use keep weight 0 in the splat, so the
    // shader's epsilon skips them — but zero them anyway so a stale layer can
    // never be read if a future palette grows. (Most climates use fewer than
    // MAX_SPLAT_LAYERS materials, so this is the common case, not a corner.)
    for (let i = 0; i < MAX_SPLAT_LAYERS; i++) {
      const layer = this.layers[i];
      const base = LAYERS_OFFSET_FLOATS + i * FLOATS_PER_LAYER;
      data[base] = layer ? layer.layerIndex : 0;
      data[base + 1] = layer ? layer.uvScale : 1;
      data[base + 2] = layer ? layer.macroUvScale : 0;
      data[base + 3] = layer ? layer.specular : 0;
      data[base + 4] = layer ? layer.normalYSign : 1;
      data[base + 5] = layer ? layer.heightScale : 0;
      data[base + 6] = layer ? layer.shininess : 32;
      // Never 0 for an unused slot: the shader subtracts this from the winning
      // score, and a 0 there would make an empty slot's cutoff exclude
      // everything if it ever won.
      data[base + 7] = layer ? layer.blendDepth : this.heightBlendDepth;
      data[base + 8] = layer ? layer.macroLayerIndex : 0;
      data[base + 9] = layer ? layer.macroNormalYSign : 1;
      data[base + 10] = layer ? layer.macroStrength : 0;
      data[base + 11] = 0; // _pad
    }

    device.queue.writeBuffer(
      this._paramsBuffer,
      0,
      data as ArrayBufferView<ArrayBuffer>
    );
  }

  set splatTexture(texture: GPUTexture) {
    this._splatTexture = texture;
    this.requiresBuild = true;
  }

  get splatTexture(): GPUTexture {
    return this._splatTexture;
  }

  set splatTextureExt(texture: GPUTexture) {
    this._splatTextureExt = texture;
    this.requiresBuild = true;
  }

  get splatTextureExt(): GPUTexture {
    return this._splatTextureExt;
  }

  set albedoView(view: GPUTextureView) {
    this._albedoView = view;
    this.requiresBuild = true;
  }

  get albedoView(): GPUTextureView {
    return this._albedoView;
  }

  set normalView(view: GPUTextureView) {
    this._normalView = view;
    this.requiresBuild = true;
  }

  get normalView(): GPUTextureView {
    return this._normalView;
  }

  set armView(view: GPUTextureView) {
    this._armView = view;
    this.requiresBuild = true;
  }

  get armView(): GPUTextureView {
    return this._armView;
  }

  set heightView(view: GPUTextureView) {
    this._heightView = view;
    this.requiresBuild = true;
  }

  get heightView(): GPUTextureView {
    return this._heightView;
  }

  set splatSampler(sampler: GPUSampler) {
    this._splatSampler = sampler;
    this.requiresBuild = true;
  }

  get splatSampler(): GPUSampler {
    return this._splatSampler;
  }

  get seamlessSampler(): GPUSampler {
    return this._seamlessSampler;
  }

  set seamlessSampler(sampler: GPUSampler) {
    this._seamlessSampler = sampler;
    this.requiresBuild = true;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
