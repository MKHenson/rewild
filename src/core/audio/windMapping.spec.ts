import {
  AIR_LAYER_AT,
  EARS_START,
  GUST_SHOT_START,
  airBlend,
  airCutoff,
  airGain,
  earsGain,
  gustShotGain,
} from './windMapping';

describe('airBlend', () => {
  it('plays each loop alone at its windiness', () => {
    AIR_LAYER_AT.forEach((at, i) => expect(airBlend(at)).toBeCloseTo(i, 10));
  });

  it('crossfades half way between two loops', () => {
    const mid = (AIR_LAYER_AT[0] + AIR_LAYER_AT[1]) / 2;
    expect(airBlend(mid)).toBeCloseTo(0.5, 10);
  });

  it('holds the first loop below it and the last above it', () => {
    expect(airBlend(0)).toBe(0);
    expect(airBlend(1)).toBe(AIR_LAYER_AT.length - 1);
  });
});

describe('airGain', () => {
  it('follows the windiness from silent to full', () => {
    expect(airGain(0, 0)).toBe(0);
    expect(airGain(0.4, 0)).toBeCloseTo(0.4, 10);
    expect(airGain(1, 0)).toBe(1);
  });

  it('swells with a gust, more in strong wind', () => {
    const calm = airGain(0.3, 1) / airGain(0.3, 0);
    const strong = airGain(0.7, 1) / airGain(0.7, 0);
    expect(calm).toBeGreaterThan(1);
    expect(strong).toBeGreaterThan(calm);
  });

  it('stays silent in still air and never passes full', () => {
    expect(airGain(0, 1)).toBe(0);
    expect(airGain(1, 1)).toBe(1);
  });
});

describe('airCutoff', () => {
  it('opens as the wind rises', () => {
    expect(airCutoff(0)).toBeCloseTo(1500, 6);
    expect(airCutoff(1)).toBeCloseTo(18000, 6);
    expect(airCutoff(0.5)).toBeGreaterThan(airCutoff(0.2));
  });
});

describe('earsGain', () => {
  it('is silent below the gale', () => {
    expect(earsGain(EARS_START, 1, 1)).toBe(0);
    expect(earsGain(0.5, 1, 1)).toBe(0);
  });

  it('is full facing into a full gale at a gust', () => {
    expect(earsGain(1, 1, 1)).toBe(1);
  });

  it('is silent with your back to the wind', () => {
    expect(earsGain(1, 0, 1)).toBe(0);
  });

  it('keeps a share between gusts', () => {
    expect(earsGain(1, 1, 0)).toBeCloseTo(0.4, 10);
  });
});

describe('gustShotGain', () => {
  it('is silent in light wind and full in a gale', () => {
    expect(gustShotGain(GUST_SHOT_START)).toBe(0);
    expect(gustShotGain(1)).toBe(1);
  });
});
