import { ImageLoader } from './ImageLoader';
import { ITexture } from './ITexture';
import { TextureProperties } from './Texture';

export class BitmapCubeTexture implements ITexture {
  src: string[];
  gpuTexture: GPUTexture;
  properties: TextureProperties;

  constructor(properties: TextureProperties, src: string[]) {
    this.src = src;
    this.properties = properties;
  }

  async load(device: GPUDevice) {
    const loader = await new ImageLoader().loadImages(this.src);

    this.gpuTexture = device.createTexture({
      size: {
        width: loader.maxWidth,
        height: loader.maxHeight,
        depthOrArrayLayers: this.src.length,
      },
      format: 'rgba8unorm',
      dimension: '2d',
      mipLevelCount: 1, // TODO: Not sure what to do here yet
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    for (let i = 0; i < this.src.length; i++) {
      device.queue.copyExternalImageToTexture(
        { source: loader.images[i] },
        { texture: this.gpuTexture, origin: { x: 0, y: 0, z: i } },
        { width: loader.maxWidth, height: loader.maxHeight }
      );
    }

    return this;
  }
}
