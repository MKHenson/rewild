import { rainWindSpeed } from './SkyRenderer';

describe('rainWindSpeed', () => {
  it('is still in a calm and 10 m/s a unit in light wind', () => {
    expect(rainWindSpeed(0)).toBe(0);
    expect(rainWindSpeed(0.2)).toBeCloseTo(2.11);
  });

  it('climbs to a gale near the ocean’s', () => {
    expect(rainWindSpeed(0.8)).toBeCloseTo(15.17);
    expect(rainWindSpeed(1)).toBe(24);
    expect(rainWindSpeed(2)).toBe(24);
  });
});
