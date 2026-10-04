import { GUST_SPEED } from './GustField';
import { WindState } from './WindState';

describe('WindState', () => {
  it('blows the way the clouds and rain drift: against windDirection', () => {
    const wind = new WindState();
    wind.update(1, 0, 0.5, 0, 0);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[1]).toBe(-0);
    expect(wind.vec[2]).toBe(0.5);
  });

  it('normalises the direction and clamps the strength', () => {
    const wind = new WindState();
    wind.update(3, 4, 1.5, 0, 0);
    expect(wind.vec[0]).toBeCloseTo(-0.6);
    expect(wind.vec[1]).toBeCloseTo(-0.8);
    expect(wind.vec[2]).toBe(1);
  });

  it('falls back to a fixed direction before the weather has one', () => {
    const wind = new WindState();
    wind.update(0, 0, 0.3, 0, 0);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[1]).toBe(-0);
  });

  it('runs its clock at the strength', () => {
    const wind = new WindState();
    wind.update(1, 0, 1, 0, 2);
    expect(wind.vec[3]).toBeCloseTo(2);
    wind.update(1, 0, 0.25, 0, 2);
    expect(wind.vec[3]).toBeCloseTo(2.5);
    wind.update(1, 0, 0, 0, 5);
    expect(wind.vec[3]).toBeCloseTo(2.5);
  });

  it('lets an override replace the weather and drive the clock', () => {
    const wind = new WindState();
    wind.override = { strength: 0.8, bearing: 90 };
    wind.update(1, 0, 0.1, 0, 1);
    expect(wind.vec[0]).toBeCloseTo(0);
    expect(wind.vec[1]).toBeCloseTo(1);
    expect(wind.vec[2]).toBeCloseTo(0.8);
    expect(wind.vec[3]).toBeCloseTo(0.8);

    wind.override = null;
    wind.update(1, 0, 0.1, 0, 1);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[2]).toBeCloseTo(0.1);
    expect(wind.vec[3]).toBeCloseTo(0.9);
  });

  it('carries the gust field downwind at the strength', () => {
    const wind = new WindState();
    wind.update(1, 0, 0.5, 0, 2);
    expect(wind.gustDrift[0]).toBeCloseTo(-GUST_SPEED);
    expect(wind.gustDrift[1]).toBeCloseTo(0);
  });

  it('moves every field on from where it is when the wind turns', () => {
    const wind = new WindState();
    for (let i = 0; i < 600; i++) wind.update(1, 0, 1, 0.5, 1 / 60);
    const gustX = wind.gustDrift[0];
    const cloudX = wind.cloudDrift[0];
    const scroll = wind.cirrusScroll;

    wind.update(0, 1, 1, 0.5, 1 / 60);
    expect(wind.gustDrift[0]).toBeCloseTo(gustX);
    expect(Math.abs(wind.gustDrift[1])).toBeLessThan(1);
    expect(wind.cloudDrift[0]).toBeCloseTo(cloudX);
    expect(Math.abs(wind.cloudDrift[1])).toBeLessThan(1);
    expect(wind.cirrusScroll - scroll).toBeLessThan(0.01);
  });

  it('tells the clouds a rising cloudiness comes from upwind', () => {
    const wind = new WindState();
    let cloudiness = 0.3;
    for (let i = 0; i < 1800; i++) {
      cloudiness += 0.01 / 60;
      wind.update(1, 0, 0.5, cloudiness, 1 / 60);
    }
    expect(wind.cloudFront[0]).toBeCloseTo(1);
    expect(wind.cloudFront[1]).toBeCloseTo(0);
    expect(wind.cloudTrend).toBeCloseTo(0.01, 3);
    // 0.01 a second over 60 s leans the far upwind sky 0.6 of its reach.
    expect(wind.cloudFront[3]).toBeCloseTo(0.6 * 0.25, 2);

    for (let i = 0; i < 1800; i++) wind.update(1, 0, 0.5, cloudiness, 1 / 60);
    expect(Math.abs(wind.cloudFront[3])).toBeLessThan(0.001);
  });

  it('caps how far the upwind sky leans however fast the sky changes', () => {
    const wind = new WindState();
    wind.update(1, 0, 0.5, 0, 1 / 60);
    for (let i = 0; i < 600; i++) wind.update(1, 0, 0.5, i % 2, 1 / 60);
    expect(Math.abs(wind.cloudFront[3])).toBeLessThanOrEqual(0.25);
  });

  it('turns the upper air slowly toward the surface wind', () => {
    const wind = new WindState();
    wind.update(1, 0, 0.5, 0, 0);
    expect(wind.upperDirection[0]).toBeCloseTo(1);

    wind.update(0, 1, 0.5, 0, 1);
    const turned = Math.atan2(wind.upperDirection[1], wind.upperDirection[0]);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(0.1);

    for (let i = 0; i < 600; i++) wind.update(0, 1, 0.5, 0, 1);
    expect(wind.upperDirection[1]).toBeCloseTo(1);
  });
});
