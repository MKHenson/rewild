import {
  GUST_PUSH,
  HEADWIND_SLOW,
  easeGustPush,
  gustPushSpeed,
  headwindSpeedShare,
} from './Headwind';

// Air moving toward +x: walking toward −x is straight into it.
describe('headwindSpeedShare', () => {
  it('slows a player walking into a full gale the most', () => {
    expect(headwindSpeedShare(-1, 0, 1, 0, 1)).toBeCloseTo(1 - HEADWIND_SLOW);
  });

  it('leaves full speed below the gale and with the wind behind', () => {
    expect(headwindSpeedShare(-1, 0, 1, 0, 0.8)).toBe(1);
    expect(headwindSpeedShare(1, 0, 1, 0, 1)).toBe(1);
  });

  it('eases out across 45 degrees either side of the wind', () => {
    const at = (degrees: number) => {
      const a = (degrees * Math.PI) / 180;
      return headwindSpeedShare(-Math.cos(a), Math.sin(a), 1, 0, 1);
    };
    expect(at(10)).toBeCloseTo(1 - HEADWIND_SLOW);
    expect(at(-30)).toBeGreaterThan(at(10));
    expect(at(-30)).toBeLessThan(1);
    expect(at(50)).toBe(1);
  });

  it('ramps in with the windiness', () => {
    const half = headwindSpeedShare(-1, 0, 1, 0, 0.9);
    expect(half).toBeCloseTo(1 - HEADWIND_SLOW / 2);
  });

  it('leaves a still player alone', () => {
    expect(headwindSpeedShare(0, 0, 1, 0, 1)).toBe(1);
  });
});

describe('gustPushSpeed', () => {
  it('shoves hardest at a full gale’s strongest gust', () => {
    expect(gustPushSpeed(1, 1)).toBe(GUST_PUSH);
    expect(gustPushSpeed(0.5, 1)).toBeCloseTo(GUST_PUSH / 2);
  });

  it('does not shove below the gale or in a lull', () => {
    expect(gustPushSpeed(1, 0.8)).toBe(0);
    expect(gustPushSpeed(0, 1)).toBe(0);
  });
});

describe('easeGustPush', () => {
  it('builds toward the shove and holds it there', () => {
    const built = easeGustPush(0, 4, 0.3);
    expect(built).toBeGreaterThan(2);
    expect(built).toBeLessThan(4);
    expect(easeGustPush(4, 4, 1)).toBeCloseTo(4);
  });
});
