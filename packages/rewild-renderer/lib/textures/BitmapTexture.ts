import { ImageLoader } from './ImageLoader';
import { ITexture } from './ITexture';
import { getNumMipmaps, TextureProperties } from './Texture';

import { Renderer } from '..';

export class BitmapTexture implements ITexture {
  properties: TextureProperties;
  src: string;
  gpuTexture: GPUTexture;

  constructor(name: TextureProperties, src: string) {
    this.src = src;
    this.properties = name;
  }

  async load(renderer: Renderer) {
    const { device } = renderer;
    const loader = await new ImageLoader().loadImages([this.src]);

    this.gpuTexture = device.createTexture({
      size: {
        width: loader.maxWidth,
        height: loader.maxHeight,
        depthOrArrayLayers: 1,
      },
      format: 'rgba8unorm',
      dimension: '2d',
      mipLevelCount: this.properties.generateMipmaps
        ? getNumMipmaps(loader.maxWidth, loader.maxHeight)
        : 1,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: loader.images[0] },
      { texture: this.gpuTexture },
      [loader.maxWidth, loader.maxHeight]
    );

    if (this.gpuTexture.mipLevelCount > 1) {
      renderer.mipmapGenerator.generateMips(device, this.gpuTexture);
    }

    return this;
  }
}
