import { ImageLoader } from "./ImageLoader";
import { Sampler } from "./Sampler";
import { Texture } from "./Texture";

export class BitmapTexture extends Texture {
  src: string;

  constructor(name: string, src: string, device: GPUDevice, sampler?: Sampler) {
    super(name, device, sampler);
    this.src = src;
  }

  async load(device: GPUDevice) {
    let gpuTexture: GPUTexture;
    const loader = await new ImageLoader().loadImages([this.src]);

    gpuTexture = device.createTexture({
      size: { width: loader.maxWidth, height: loader.maxHeight, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      dimension: "2d",
      mipLevelCount: 1, // TODO: why doesnt this work? this.getNumMipmaps(loader.maxWidth, loader.maxHeight),
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture({ source: loader.images[0] }, { texture: gpuTexture }, [
      loader.maxWidth,
      loader.maxHeight,
    ]);

    this.gpuTexture = gpuTexture;
    return this;
  }
}
