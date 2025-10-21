import { Renderer } from '..';
import { ITexture } from './ITexture';
import { MipMapGenerator } from './MipMapGenerator';
import { TextureProperties, getNumMipmaps } from './Texture';

export class DataTexture implements ITexture {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  properties: TextureProperties;
  gpuTexture: GPUTexture;
  static mipMapGenerator: MipMapGenerator;

  constructor(
    properties: TextureProperties,
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
  ) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.properties = properties;

    if (!DataTexture.mipMapGenerator) {
      DataTexture.mipMapGenerator = new MipMapGenerator();
    }
  }

  async load(renderer: Renderer) {
    const { device } = renderer;
    this.gpuTexture = device.createTexture({
      size: [this.width, this.height],
      format: 'rgba8unorm',
      dimension: '2d',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
      mipLevelCount: this.properties.generateMipmaps
        ? getNumMipmaps(this.width, this.height)
        : 1,
    });

    device.queue.writeTexture(
      { texture: this.gpuTexture },
      this.data as BufferSource,
      { bytesPerRow: this.width * 4 },
      { width: this.width, height: this.height }
    );

    if (this.gpuTexture.mipLevelCount > 1) {
      DataTexture.mipMapGenerator.generateMips(device, this.gpuTexture);
    }

    return this;
  }
}
