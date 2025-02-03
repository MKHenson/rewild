export class Sampler {
  gpuSampler: GPUSampler;

  constructor(device: GPUDevice, option: GPUSamplerDescriptor = {}) {
    option = {
      magFilter: option.magFilter || 'linear',
      minFilter: option.minFilter || 'linear',
      mipmapFilter: option.mipmapFilter || 'linear',
      addressModeU: option.addressModeU || 'repeat',
      addressModeV: option.addressModeV || 'repeat',
      addressModeW: option.addressModeW || 'repeat',
    };

    this.gpuSampler = device.createSampler(option);
  }
}
