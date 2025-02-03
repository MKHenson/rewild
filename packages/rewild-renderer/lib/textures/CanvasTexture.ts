import { ITexture } from './ITexture';
import { TextureProperties } from './Texture';

export class CanvasTexture implements ITexture {
  canvas: HTMLCanvasElement;
  properties: TextureProperties;
  gpuTexture: GPUTexture;

  constructor(properties: TextureProperties, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.properties = properties;
  }

  async load(device: GPUDevice) {
    this.gpuTexture = device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: 'rgba8unorm',
      dimension: '2d',
      mipLevelCount: 1, // TODO: why doesnt this work? getNumMipmaps(loader.maxWidth, loader.maxHeight),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: this.canvas },
      { texture: this.gpuTexture },
      [this.canvas.width, this.canvas.height]
    );

    return this;
  }
}
