import {
  DRIPS_RAIN_HIDES,
  RAIN_FULL_AT,
  RAIN_HEAVY_AT,
  RAIN_HEAVY_FROM,
  RAIN_HEAVY_LEVEL,
  dripsGain,
  rainBlend,
  rainCutoff,
  rainGain,
} from './rainMapping';

describe('rainGain', () => {
  it('rises from silent to full with the rain', () => {
    expect(rainGain(0)).toBe(0);
    expect(rainGain(RAIN_FULL_AT / 2)).toBeCloseTo(0.5, 10);
    expect(rainGain(RAIN_FULL_AT)).toBe(1);
  });

  it('turns down as the heavy loop takes over', () => {
    expect(rainGain(RAIN_HEAVY_AT)).toBeCloseTo(RAIN_HEAVY_LEVEL, 10);
    expect(rainGain(1)).toBeCloseTo(RAIN_HEAVY_LEVEL, 10);
  });
});

describe('rainBlend', () => {
  it('plays the light loop alone in a drizzle and the heavy loop alone in a downpour', () => {
    expect(rainBlend(RAIN_HEAVY_FROM)).toBe(0);
    expect(rainBlend(RAIN_HEAVY_AT)).toBe(1);
    expect(rainBlend((RAIN_HEAVY_FROM + RAIN_HEAVY_AT) / 2)).toBeCloseTo(
      0.5,
      10
    );
  });
});

describe('rainCutoff', () => {
  it('opens as the rain gets heavier', () => {
    expect(rainCutoff(0)).toBeCloseTo(5000, 6);
    expect(rainCutoff(1)).toBeCloseTo(20000, 6);
    expect(rainCutoff(0.6)).toBeGreaterThan(rainCutoff(0.2));
  });
});

describe('dripsGain', () => {
  it('follows the wet film once the rain has stopped', () => {
    expect(dripsGain(1, 0)).toBe(1);
    expect(dripsGain(0.4, 0)).toBeCloseTo(0.4, 10);
    expect(dripsGain(0, 0)).toBe(0);
  });

  it('is lost under steady rain', () => {
    expect(dripsGain(1, DRIPS_RAIN_HIDES)).toBe(0);
    expect(dripsGain(1, DRIPS_RAIN_HIDES / 2)).toBeLessThan(1);
  });
});
