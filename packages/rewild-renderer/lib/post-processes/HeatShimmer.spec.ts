import { heatShimmerOctaves, heatShimmerStrength } from './HeatShimmer';

describe('heat shimmer', () => {
  it('stays off below a hot afternoon and is full at the hottest', () => {
    expect(heatShimmerStrength(0.5)).toBe(0);
    expect(heatShimmerStrength(0.85)).toBe(0);
    expect(heatShimmerStrength(1)).toBe(1);
  });

  it('grows with the heat between the two', () => {
    const warm = heatShimmerStrength(0.9);
    const hot = heatShimmerStrength(0.95);
    expect(warm).toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(warm);
    expect(hot).toBeLessThan(1);
  });

  it('takes fewer octaves down the tiers and none on low', () => {
    expect(heatShimmerOctaves('ultra')).toBe(2);
    expect(heatShimmerOctaves('high')).toBe(2);
    expect(heatShimmerOctaves('medium')).toBe(1);
    expect(heatShimmerOctaves('low')).toBe(0);
  });
});
