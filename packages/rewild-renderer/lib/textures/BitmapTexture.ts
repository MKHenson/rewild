import { ImageLoader } from './ImageLoader';
import { ITexture } from './ITexture';
import { getNumMipmaps, rgba8FormatFor, TextureProperties } from './Texture';
import { imageAlphaHistograms } from './AlphaCoverage';

import { Renderer } from '..';

export class BitmapTexture implements ITexture {
  properties: TextureProperties;
  src: string;
  gpuTexture: GPUTexture;
  alphaHistograms: Uint32Array[] | null = null;

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
      format: rgba8FormatFor(this.properties.colorSpace),
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

    // JPEG has no alpha to histogram.
    if (!/\.jpe?g$/i.test(this.src))
      this.alphaHistograms = imageAlphaHistograms(loader.images[0]);

    // Histograms exist only for an image with a translucent texel, which is
    // the one a plain mip chain would fringe.
    if (this.gpuTexture.mipLevelCount > 1) {
      if (this.alphaHistograms)
        renderer.mipmapGenerator.generateCoverageMips(device, this.gpuTexture);
      else renderer.mipmapGenerator.generateMips(device, this.gpuTexture);
    }

    return this;
  }
}
