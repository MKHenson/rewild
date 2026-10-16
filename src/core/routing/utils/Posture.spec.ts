import {
  COLLAPSE_SPEED_MAX,
  collapseRoll,
  collapseShare,
  collapseTime,
  easeEye,
} from './Posture';

const DROP = 1.55;

describe('easeEye', () => {
  it('moves part of the way each frame and arrives within half a second', () => {
    const step = easeEye(1.8, 0.9, 1 / 60);
    expect(step).toBeLessThan(1.8);
    expect(step).toBeGreaterThan(0.9);
    let eye = 1.8;
    for (let i = 0; i < 30; i++) eye = easeEye(eye, 0.9, 1 / 60);
    expect(eye).toBeCloseTo(0.9, 2);
  });

  it('holds still at the target', () => {
    expect(easeEye(1.8, 1.8, 1 / 60)).toBe(1.8);
  });

  it('eases the same over a long frame as over many short ones', () => {
    let eye = 0.9;
    for (let i = 0; i < 10; i++) eye = easeEye(eye, 1.8, 0.01);
    expect(eye).toBeCloseTo(easeEye(0.9, 1.8, 0.1), 9);
  });
});

describe('collapseTime', () => {
  it('takes about 0.6 s from standing still', () => {
    expect(collapseTime(DROP, 0)).toBeCloseTo(0.6, 1);
  });

  it('slams down from a fatal landing, no faster than the legs allow', () => {
    expect(collapseTime(DROP, 30)).toBeLessThan(0.2);
    expect(collapseTime(DROP, 30)).toBe(collapseTime(DROP, COLLAPSE_SPEED_MAX));
  });
});

describe('collapseShare', () => {
  const still = collapseTime(DROP, 0);

  it('has not started before the death', () => {
    expect(collapseShare(0, still, 0)).toBe(0);
  });

  it('falls slowly at first from still and fastest as it lands', () => {
    const early = collapseShare(still * 0.25, still, 0);
    const late =
      collapseShare(still, still, 0) - collapseShare(still * 0.75, still, 0);
    expect(early).toBeLessThan(0.1);
    expect(late).toBeGreaterThan(early * 2);
  });

  it('keeps falling at once from a landing', () => {
    const time = collapseTime(DROP, COLLAPSE_SPEED_MAX);
    expect(collapseShare(time * 0.25, time, COLLAPSE_SPEED_MAX)).toBeGreaterThan(
      0.2
    );
  });

  it('bounces up a little on landing and settles on the ground', () => {
    expect(collapseShare(still + 0.08, still, 0)).toBeLessThan(1);
    expect(collapseShare(still + 0.08, still, 0)).toBeGreaterThan(0.95);
    expect(collapseShare(still + 2, still, 0)).toBeCloseTo(1, 4);
  });
});

describe('collapseRoll', () => {
  it('rolls onto the side as the body falls', () => {
    expect(collapseRoll(0, 0.6)).toBe(0);
    expect(collapseRoll(0.3, 0.6)).toBeGreaterThan(0);
    expect(collapseRoll(0.3, 0.6)).toBeLessThan(1);
    expect(collapseRoll(0.6, 0.6)).toBe(1);
  });
});
