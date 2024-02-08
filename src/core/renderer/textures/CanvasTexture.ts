import { Sampler } from "./Sampler";
import { Texture } from "./Texture";

export class CanvasTexture extends Texture {
  canvas: HTMLCanvasElement;

  constructor(name: string, canvas: HTMLCanvasElement, device: GPUDevice, sampler?: Sampler) {
    super(name, device, sampler);
    this.canvas = canvas;
  }

  async load(device: GPUDevice) {
    let gpuTexture: GPUTexture;

    gpuTexture = device.createTexture({
      size: { width: this.canvas.width, height: this.canvas.height, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      dimension: "2d",
      mipLevelCount: 1, // TODO: why doesnt this work? this.getNumMipmaps(loader.maxWidth, loader.maxHeight),
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture({ source: this.canvas }, { texture: gpuTexture }, [
      this.canvas.width,
      this.canvas.height,
    ]);

    this.gpuTexture = gpuTexture;
    return this;
  }
}
