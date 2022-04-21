const TABLE: Map<string, Sampler> = new Map();

export class Sampler {
  id: string;
  gpuSampler: GPUSampler;

  constructor(device: GPUDevice, option: GPUSamplerDescriptor = {}) {
    option = {
      magFilter: option.magFilter || "linear",
      minFilter: option.minFilter || "linear",
      mipmapFilter: option.mipmapFilter || "linear",
      addressModeU: option.addressModeU || "repeat",
      addressModeV: option.addressModeV || "repeat",
      addressModeW: option.addressModeW || "repeat",
    };

    this.id = JSON.stringify(option);
    if (TABLE.has(this.id)) return TABLE.get(this.id)!;
    else this.gpuSampler = device.createSampler(option);
    TABLE.set(this.id, this);
  }
}
