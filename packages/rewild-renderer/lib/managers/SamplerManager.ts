import { Renderer } from '../Renderer';

export type SamplerType =
  | 'mip-generator'
  | 'nearest-simple'
  | 'non-filtering'
  | 'linear'
  | 'linear-clamped'
  | 'msdf-sampler'
  | 'depth-comparison';

/**
 * Canonical string for a descriptor, so two requests for the same sampling
 * state share one GPUSampler. Also usable as part of a material's identity —
 * two materials that sample differently are not the same material.
 *
 * The fallbacks are WebGPU's own, so the key describes the sampler that would
 * actually be created rather than what the caller might have meant.
 */
export function samplerKey(descriptor: GPUSamplerDescriptor): string {
  return [
    descriptor.magFilter ?? 'nearest',
    descriptor.minFilter ?? 'nearest',
    descriptor.mipmapFilter ?? 'nearest',
    descriptor.addressModeU ?? 'clamp-to-edge',
    descriptor.addressModeV ?? 'clamp-to-edge',
  ].join('|');
}

export class SamplerManager {
  samplers: Map<SamplerType, GPUSampler>;
  /**
   * Samplers described rather than named. The named set above covers what the
   * engine's own passes need; an imported model states its sampling in glTF's
   * terms and can land on any combination of them.
   */
  private describedSamplers: Map<string, GPUSampler>;
  initialized: boolean;

  constructor() {
    this.samplers = new Map();
    this.describedSamplers = new Map();
    this.initialized = false;
  }

  get(name: SamplerType) {
    const toRet = this.samplers.get(name);
    if (!toRet) throw new Error(`Could not find asset with name ${name}`);
    return toRet;
  }

  /** Returns the sampler for this state, creating it on first request. */
  getOrCreate(device: GPUDevice, descriptor: GPUSamplerDescriptor): GPUSampler {
    const key = samplerKey(descriptor);
    let sampler = this.describedSamplers.get(key);

    if (!sampler) {
      sampler = device.createSampler({ label: key, ...descriptor });
      this.describedSamplers.set(key, sampler);
    }

    return sampler;
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
      'msdf-sampler',
      device.createSampler({
        label: 'MSDF text sampler',
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'linear',
        maxAnisotropy: 16,
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
    this.describedSamplers.clear();
    this.initialized = false;
  }

  addSampler(id: SamplerType, sampler: GPUSampler) {
    this.samplers.set(id, sampler);
    return sampler;
  }
}
