import { gustField, gustShare } from './GustField';

const CALM = [1, 0, 0, 0];

describe('gustField', () => {
  it('stays within 0..1 and varies across the world', () => {
    let low = 1;
    let high = 0;
    for (let x = -500; x < 500; x += 7)
      for (let z = -500; z < 500; z += 11) {
        const g = gustField(x, z, CALM);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        low = Math.min(low, g);
        high = Math.max(high, g);
      }
    expect(high - low).toBeGreaterThan(0.4);
  });

  it('is smooth: neighbours a metre apart read nearly the same', () => {
    for (let x = 0; x < 300; x += 13)
      expect(
        Math.abs(gustField(x, 40, CALM) - gustField(x + 1, 40, CALM))
      ).toBeLessThan(0.08);
  });

  it('carries its gusts downwind as the clock runs', () => {
    // Air moving toward +x, twenty metres a full-wind second: a coarse
    // feature at x now reads at x + 20 a second later, give or take the
    // eddies.
    const now = [1, 0, 1, 0];
    const later = [1, 0, 1, 1];
    let near = 0;
    for (let x = 0; x < 600; x += 5)
      near += Math.abs(gustField(x, 0, now) - gustField(x + 20, 0, later));
    let still = 0;
    for (let x = 0; x < 600; x += 5)
      still += Math.abs(gustField(x, 0, now) - gustField(x, 0, later));
    expect(near).toBeLessThan(still);
  });
});

describe('gustShare', () => {
  it('is nothing in the lulls and full at a gust’s height', () => {
    expect(gustShare(0.5)).toBe(0);
    expect(gustShare(0.6)).toBe(0);
    expect(gustShare(0.7)).toBeCloseTo(0.5);
    expect(gustShare(0.8)).toBe(1);
  });

  it('gusts in bursts at a fixed point in full wind', () => {
    const dt = 0.05;
    let on = 0;
    let bursts = 0;
    let was = false;
    const seconds = 600;
    for (let t = 0; t < seconds; t += dt) {
      const gusting = gustShare(gustField(13.7, -41.2, [1, 0, 1, t])) > 0;
      if (gusting) on += dt;
      if (gusting && !was) bursts++;
      was = gusting;
    }
    expect(on / seconds).toBeLessThan(0.35);
    expect(on / bursts).toBeLessThan(2.5);
  });
});
