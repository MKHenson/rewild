import { ITexture } from './ITexture';
import { TextureProperties } from './Texture';

export class DataTexture implements ITexture {
  data: Uint8Array;
  width: number;
  height: number;
  properties: TextureProperties;
  gpuTexture: GPUTexture;

  constructor(
    properties: TextureProperties,
    data: Uint8Array,
    width: number,
    height: number
  ) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.properties = properties;
  }

  async load(device: GPUDevice) {
    this.gpuTexture = device.createTexture({
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
      { texture: this.gpuTexture },
      this.data,
      { bytesPerRow: this.width * 4 },
      { width: this.width, height: this.height }
    );

    return this;
  }
}
