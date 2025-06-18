import { Renderer } from '../Renderer';

export type SamplerType =
  | 'mip-generator'
  | 'nearest-simple'
  | 'non-filtering'
  | 'linear'
  | 'linear-clamped'
  | 'depth-comparison';

export class SamplerManager {
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

    // Add the non-filtering sampler
    this.addSampler(
      'non-filtering',
      device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
        mipmapFilter: 'nearest',
        compare: 'less-equal',
        label: 'non-filtering',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
      })
    );

    // Add a depth comparison sampler
    this.addSampler(
      'depth-comparison',
      device.createSampler({
        magFilter: 'linear', // Use a valid filter mode
        minFilter: 'linear', // Use a valid filter mode
        mipmapFilter: 'linear', // Use a valid filter mode
        compare: 'less-equal', // Set the compare property separately
        label: 'depth-sampler',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
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
      'linear-clamped',
      device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        label: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
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

  dispose() {
    this.samplers.clear();
    this.initialized = false;
  }

  addSampler(id: SamplerType, sampler: GPUSampler) {
    this.samplers.set(id, sampler);
    return sampler;
  }
}
