import { Sampler } from "./Sampler";

let defaultSampler: Sampler;

export abstract class Texture {
  name: string;
  sampler: Sampler;
  gpuTexture: GPUTexture;
  generateMipmaps: boolean;

  constructor(name: string, device: GPUDevice, sampler?: Sampler) {
    this.name = name;
    this.generateMipmaps = true;

    if (!defaultSampler) defaultSampler = new Sampler(device);
    this.sampler = sampler || defaultSampler;
  }

  getNumMipmaps(w: number, h: number) {
    if (this.generateMipmaps) {
      const mipMaps = Math.round(Math.log2(Math.max(w, h)));
      if (mipMaps > 10) return 11;
      return mipMaps + 1;
    }

    return 1;
  }

  abstract load(device: GPUDevice): Promise<Texture>;
}
