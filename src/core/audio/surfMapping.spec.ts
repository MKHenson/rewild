import {
  LAP_FADE_TO,
  LAP_NEAR,
  SEA_CALM,
  SEA_STORM,
  SURF_CALM_LEVEL,
  SURF_FADE_TO,
  SURF_NEAR,
  lapDistanceGain,
  lapLevel,
  seaState,
  surfCalmGain,
  surfDistanceGain,
  surfStormGain,
} from './surfMapping';

describe('surfDistanceGain', () => {
  it('is full on the beach and falls with distance', () => {
    expect(surfDistanceGain(0)).toBe(1);
    expect(surfDistanceGain(SURF_NEAR)).toBe(1);
    expect(surfDistanceGain(100)).toBeLessThan(surfDistanceGain(50));
    expect(surfDistanceGain(100)).toBeGreaterThan(0.1);
  });

  it('is silent far inland', () => {
    expect(surfDistanceGain(SURF_FADE_TO)).toBe(0);
  });
});

describe('the sea state', () => {
  it('is calm in light wind and a storm in a gale', () => {
    expect(seaState(SEA_CALM)).toBe(0);
    expect(seaState(SEA_STORM)).toBe(1);
  });

  it('plays the calm loop alone, softer, on a calm sea', () => {
    expect(surfCalmGain(0)).toBeCloseTo(SURF_CALM_LEVEL, 6);
    expect(surfStormGain(0)).toBe(0);
  });

  it('plays the storm loop alone, full, on a storm sea', () => {
    expect(surfCalmGain(1)).toBeCloseTo(0, 6);
    expect(surfStormGain(1)).toBeCloseTo(1, 6);
  });

  it('holds the loudness through the crossfade', () => {
    const level = (sea: number) =>
      Math.hypot(surfCalmGain(sea), surfStormGain(sea));
    for (const sea of [0.25, 0.5, 0.75])
      expect(level(sea)).toBeCloseTo(
        SURF_CALM_LEVEL + (1 - SURF_CALM_LEVEL) * sea,
        6
      );
  });
});

describe('lapping', () => {
  it('is full at the shoreline and gone past its reach', () => {
    expect(lapDistanceGain(LAP_NEAR)).toBe(1);
    expect(lapDistanceGain(10)).toBeLessThan(1);
    expect(lapDistanceGain(LAP_FADE_TO)).toBe(0);
  });

  it('laps quietly in calm air and more in wind', () => {
    expect(lapLevel(1, 0)).toBeLessThan(0.5);
    expect(lapLevel(1, 1)).toBe(1);
  });

  it('follows how strongly the water laps', () => {
    expect(lapLevel(0, 1)).toBe(0);
    expect(lapLevel(0.5, 1)).toBeCloseTo(0.5, 6);
  });
});
