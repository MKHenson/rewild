import { Renderer } from '..';
import { ITexture } from './ITexture';
import { TextureProperties, getNumMipmaps, rgba8FormatFor } from './Texture';

export class DataTexture implements ITexture {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  properties: TextureProperties;
  gpuTexture: GPUTexture;

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
  }

  async load(renderer: Renderer) {
    const { device } = renderer;
    this.gpuTexture = device.createTexture({
      size: [this.width, this.height],
      format: rgba8FormatFor(this.properties.colorSpace),
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
      renderer.mipmapGenerator.generateMips(device, this.gpuTexture);
    }

    return this;
  }
}
