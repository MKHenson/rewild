import {
  DIVE_SPEED,
  FLOAT_SNAP,
  RISE_SPEED,
  SWIM_BELOW_EYE,
  SWIM_EYE_ABOVE,
  SWIM_LEAVE_MARGIN,
  WADE_SLOWEST,
  WADE_START,
  holdHeight,
  isSwimming,
  swimDepth,
  swimStep,
  wadeSpeedShare,
  waterDrag,
} from './Swimming';

const EYE = 3.2;
const DEPTH = EYE - SWIM_BELOW_EYE;

describe('isSwimming', () => {
  it('starts shoulder deep and stops a margin shallower', () => {
    expect(swimDepth(EYE)).toBeCloseTo(DEPTH);
    expect(isSwimming(false, DEPTH - 0.01, EYE)).toBe(false);
    expect(isSwimming(false, DEPTH, EYE)).toBe(true);
    expect(isSwimming(true, DEPTH - 0.01, EYE)).toBe(true);
    expect(isSwimming(true, DEPTH - SWIM_LEAVE_MARGIN - 0.01, EYE)).toBe(false);
  });

  it('floats deeper than it starts to swim, so floating keeps it swimming', () => {
    expect(EYE - SWIM_EYE_ABOVE).toBeGreaterThan(DEPTH);
  });
});

describe('wadeSpeedShare', () => {
  it('keeps full speed in a splash and slows to the floor at swim depth', () => {
    expect(wadeSpeedShare(0, EYE)).toBe(1);
    expect(wadeSpeedShare(WADE_START, EYE)).toBe(1);
    expect(wadeSpeedShare(DEPTH, EYE)).toBeCloseTo(WADE_SLOWEST);
    expect(wadeSpeedShare(10, EYE)).toBeCloseTo(WADE_SLOWEST);
  });

  it('slows steadily as the water deepens', () => {
    const half = (WADE_START + DEPTH) / 2;
    expect(wadeSpeedShare(half, EYE)).toBeCloseTo((1 + WADE_SLOWEST) / 2);
  });
});

describe('swimStep', () => {
  it('closes on the target and never passes it', () => {
    const step = swimStep(-3, 0, 0.1);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(3);
    expect(swimStep(-3, 0, 100)).toBeCloseTo(3);
    expect(swimStep(0, 0, 0.1)).toBe(0);
  });

  it('closes the same share of the gap however the time is split', () => {
    const once = swimStep(-2, 0, 0.2);
    const first = swimStep(-2, 0, 0.1);
    const twice = first + swimStep(-2 + first, 0, 0.1);
    expect(twice).toBeCloseTo(once);
  });
});

describe('holdHeight', () => {
  const LEVEL = 0;
  const FLOOR = -20;

  it('floats while nothing is held', () => {
    expect(holdHeight(NaN, 0.2, false, false, 0.1, LEVEL, FLOOR)).toBeNaN();
  });

  it('dives from where the eye is', () => {
    expect(holdHeight(NaN, 0.2, true, false, 0.1, LEVEL, FLOOR)).toBeCloseTo(
      0.2 - DIVE_SPEED * 0.1
    );
  });

  it('holds the height it stopped at', () => {
    expect(holdHeight(-5, -5, false, false, 0.1, LEVEL, FLOOR)).toBe(-5);
  });

  it('rises, and floats again near the surface', () => {
    expect(holdHeight(-5, -5, false, true, 0.1, LEVEL, FLOOR)).toBeCloseTo(
      -5 + RISE_SPEED * 0.1
    );
    const nearTop = SWIM_EYE_ABOVE - FLOAT_SNAP - 0.05;
    expect(
      holdHeight(nearTop, nearTop, false, true, 0.1, LEVEL, FLOOR)
    ).toBeNaN();
  });

  it('floats when diving stops still near the surface', () => {
    const shallow = SWIM_EYE_ABOVE - FLOAT_SNAP / 2;
    expect(
      holdHeight(shallow, shallow, false, false, 0.1, LEVEL, FLOOR)
    ).toBeNaN();
  });

  it('keeps diving near the surface while the key is held', () => {
    expect(holdHeight(0, 0, true, false, 0.01, LEVEL, FLOOR)).not.toBeNaN();
  });

  it('stops at the floor', () => {
    expect(holdHeight(-19.9, -19.9, true, false, 1, LEVEL, FLOOR)).toBe(FLOOR);
  });

  it('rises with a floor that comes up under it', () => {
    expect(holdHeight(-10, -10, false, false, 0.1, LEVEL, -8)).toBe(-8);
  });
});

describe('waterDrag', () => {
  it('takes speed away over time', () => {
    expect(Math.abs(waterDrag(-12, 0.5))).toBeLessThan(12);
    expect(waterDrag(-12, 0)).toBe(-12);
    expect(waterDrag(-12, 10)).toBeCloseTo(0);
  });
});
