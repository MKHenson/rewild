import { Renderer } from '../Renderer';

export type SamplerType = 'mip-generator' | 'nearest-simple' | 'linear';

class SamplerManager {
  samplers: Map<SamplerType, GPUSampler>;
  initialized: boolean;

  constructor() {
    this.samplers = new Map();
    this.initialized = false;
  }

  get(name: SamplerType) {
    const toRet = this.samplers.get(name);
    if (!toRet) throw new Error(`Could not find asset with name ${name}`);
    return toRet;
  }

  async initialize(renderer: Renderer) {
    if (this.initialized) return;
    const { device } = renderer;

    this.addSampler(
      'nearest-simple',
      device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        mipmapFilter: 'nearest',
        label: 'nearest-simple',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        addressModeW: 'repeat',
      })
    );

    this.addSampler(
      'linear',
      device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        label: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        addressModeW: 'repeat',
      })
    );

    this.addSampler(
      'mip-generator',
      device.createSampler({
        minFilter: 'linear',
      })
    );

    this.initialized = true;
  }

  addSampler(id: SamplerType, sampler: GPUSampler) {
    this.samplers.set(id, sampler);
    return sampler;
  }
}

export const samplerManager = new SamplerManager();
