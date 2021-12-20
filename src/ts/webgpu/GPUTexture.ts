export class Texture {
  name: string;
  path: string;
  gpuTexture: GPUTexture;
  imageData: ImageBitmap;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }

  async load(device: GPUDevice) {
    let gpuTexture: GPUTexture;
    const img = document.createElement("img");
    img.src = this.path;
    await img.decode();
    this.imageData = await createImageBitmap(img);

    gpuTexture = device.createTexture({
      size: [this.imageData.width, this.imageData.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture({ source: this.imageData }, { texture: gpuTexture }, [
      this.imageData.width,
      this.imageData.height,
    ]);

    this.gpuTexture = gpuTexture;
    return this;
  }
}
