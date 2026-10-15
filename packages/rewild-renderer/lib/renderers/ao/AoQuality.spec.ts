import { RENDER_QUALITIES } from '../../utils/RenderQuality';
import { aoConfig, aoShaderDefines } from './AoQuality';

describe('AoQuality', () => {
  it('is off on low', () => {
    expect(aoConfig('low').samples).toBe(0);
  });

  it('takes more samples and reaches further on every tier up', () => {
    for (let i = 2; i < RENDER_QUALITIES.length; i++) {
      const lower = aoConfig(RENDER_QUALITIES[i - 1]);
      const higher = aoConfig(RENDER_QUALITIES[i]);
      expect(higher.samples).toBeGreaterThan(lower.samples);
      expect(higher.radius).toBeGreaterThan(lower.radius);
      expect(higher.fadeEnd).toBeGreaterThan(lower.fadeEnd);
    }
  });

  it('fades out over a non-empty range on every tier that draws', () => {
    for (const quality of RENDER_QUALITIES) {
      const tier = aoConfig(quality);
      if (tier.samples === 0) continue;
      expect(tier.fadeEnd).toBeGreaterThan(tier.fadeStart);
    }
  });

  it('bakes a valid i32 sample count, even for the tier that draws nothing', () => {
    expect(aoShaderDefines('high').AO_SAMPLES).toBe('12');
    expect(aoShaderDefines('low').AO_SAMPLES).toBe('1');
  });
});
