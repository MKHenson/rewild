import { RAIN_STORM_LIGHT, rainLight } from './SkyRenderer';

describe('rainLight', () => {
  it('is full under a clear or patchy sky', () => {
    expect(rainLight(0, 0)).toBe(1);
    expect(rainLight(0.5, 0)).toBe(1);
  });

  it('dims to the storm light under full cloud', () => {
    expect(rainLight(1, 0)).toBeCloseTo(RAIN_STORM_LIGHT, 10);
    expect(rainLight(0.8, 0)).toBeLessThan(1);
    expect(rainLight(0.8, 0)).toBeGreaterThan(RAIN_STORM_LIGHT);
  });

  it('lights up in a lightning flash', () => {
    expect(rainLight(1, 1)).toBe(1);
    expect(rainLight(1, 0.5)).toBeGreaterThan(RAIN_STORM_LIGHT);
  });
});
