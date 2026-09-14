import { WindState } from './WindState';

describe('WindState', () => {
  it('blows the way the clouds and rain drift: against windDirection', () => {
    const wind = new WindState();
    wind.update(1, 0, 0.5, 0);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[1]).toBe(-0);
    expect(wind.vec[2]).toBe(0.5);
  });

  it('normalises the direction and clamps the strength', () => {
    const wind = new WindState();
    wind.update(3, 4, 1.5, 0);
    expect(wind.vec[0]).toBeCloseTo(-0.6);
    expect(wind.vec[1]).toBeCloseTo(-0.8);
    expect(wind.vec[2]).toBe(1);
  });

  it('falls back to a fixed direction before the weather has one', () => {
    const wind = new WindState();
    wind.update(0, 0, 0.3, 0);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[1]).toBe(0);
  });

  it('runs its clock at the strength', () => {
    const wind = new WindState();
    wind.update(1, 0, 1, 2);
    expect(wind.vec[3]).toBeCloseTo(2);
    wind.update(1, 0, 0.25, 2);
    expect(wind.vec[3]).toBeCloseTo(2.5);
    wind.update(1, 0, 0, 5);
    expect(wind.vec[3]).toBeCloseTo(2.5);
  });

  it('lets an override replace the weather and drive the clock', () => {
    const wind = new WindState();
    wind.override = { strength: 0.8, bearing: 90 };
    wind.update(1, 0, 0.1, 1);
    expect(wind.vec[0]).toBeCloseTo(0);
    expect(wind.vec[1]).toBeCloseTo(1);
    expect(wind.vec[2]).toBeCloseTo(0.8);
    expect(wind.vec[3]).toBeCloseTo(0.8);

    wind.override = null;
    wind.update(1, 0, 0.1, 1);
    expect(wind.vec[0]).toBe(-1);
    expect(wind.vec[2]).toBeCloseTo(0.1);
    expect(wind.vec[3]).toBeCloseTo(0.9);
  });
});
