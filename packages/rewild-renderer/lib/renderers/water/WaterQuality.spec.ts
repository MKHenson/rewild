import {
  rainPatterLayers,
  underWaterQuality,
  waterDetailBias,
  waterLensQuality,
} from './WaterQuality';

describe('water quality tiers', () => {
  it('keeps every drop and the full blur on the top tiers', () => {
    for (const tier of ['ultra', 'high'] as const) {
      const lens = waterLensQuality(tier);
      expect(lens.dropShare).toBe(1);
      expect(lens.blurTaps).toBe(8);
      expect(lens.trailBlur).toBe(true);
    }
  });

  it('spends less on the lens down the tiers', () => {
    const medium = waterLensQuality('medium');
    const low = waterLensQuality('low');
    expect(low.dropShare).toBeLessThan(medium.dropShare);
    expect(medium.dropShare).toBeLessThan(1);
    expect(low.blurTaps).toBeLessThan(medium.blurTaps);
    expect(low.trailBlur).toBe(false);
  });

  it('sharpens the ocean slopes up the tiers', () => {
    expect(waterDetailBias('ultra')).toBeLessThan(waterDetailBias('low'));
  });

  it('turns the under-water extras off on the low tier only', () => {
    for (const tier of ['ultra', 'high', 'medium'] as const) {
      expect(underWaterQuality(tier).shafts).toBe(true);
      expect(underWaterQuality(tier).snowShare).toBeGreaterThan(0);
    }
    expect(underWaterQuality('low').shafts).toBe(false);
    expect(underWaterQuality('low').snowShare).toBe(0);
  });

  it('ripples wet surfaces with fewer raindrop layers down the tiers', () => {
    expect(rainPatterLayers('ultra')).toBe(2);
    expect(rainPatterLayers('high')).toBe(2);
    expect(rainPatterLayers('medium')).toBe(1);
    expect(rainPatterLayers('low')).toBe(0);
  });
});
