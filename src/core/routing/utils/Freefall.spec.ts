import {
  FREEFALL_FROM,
  FREEFALL_FULL,
  TERMINAL_FALL,
  fallStep,
  freefallShare,
} from './Freefall';

const GRAVITY = -9.81;
const DT = 2 / 60;

function fallFor(seconds: number): number {
  let v = 0;
  for (let t = 0; t < seconds; t += 1 / 60) v = fallStep(v, GRAVITY, DT);
  return v;
}

describe('fallStep', () => {
  it('leaves a jump to plain gravity', () => {
    expect(fallStep(10.5, GRAVITY, DT)).toBeCloseTo(10.5 + GRAVITY * DT, 9);
  });

  it('barely drags a short drop', () => {
    expect(fallStep(-5, GRAVITY, DT)).toBeCloseTo(-5 + GRAVITY * DT, 1);
  });

  it('eases a long fall to terminal speed and holds it there', () => {
    expect(-fallFor(3)).toBeGreaterThan(FREEFALL_FULL);
    expect(-fallFor(3)).toBeLessThan(TERMINAL_FALL);
    expect(-fallFor(30)).toBeCloseTo(TERMINAL_FALL, 3);
    expect(fallStep(-TERMINAL_FALL, GRAVITY, 10)).toBe(-TERMINAL_FALL);
  });
});

describe('freefallShare', () => {
  it('stays still through a jump and a short drop', () => {
    expect(freefallShare(0)).toBe(0);
    expect(freefallShare(10.5)).toBe(0);
    expect(freefallShare(FREEFALL_FROM)).toBe(0);
  });

  it('rises to full in a long fall', () => {
    const mid = freefallShare((FREEFALL_FROM + FREEFALL_FULL) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(freefallShare(FREEFALL_FULL)).toBe(1);
    expect(freefallShare(500)).toBe(1);
  });
});
