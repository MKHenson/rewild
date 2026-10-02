import { RainWetness, easeWetness, rainShare } from './RainWetness';

describe('rainShare', () => {
  it('is rain only once it is warm enough not to snow', () => {
    expect(rainShare(1, 0)).toBe(0);
    expect(rainShare(1, 0.25)).toBeCloseTo(0.5);
    expect(rainShare(0.6, 1)).toBeCloseTo(0.6);
    expect(rainShare(0, 1)).toBe(0);
  });
});

describe('easeWetness', () => {
  it('rises and falls at their own rates', () => {
    expect(easeWetness(0, 1, 2, 2, 20)).toBeCloseTo(1 - Math.exp(-1));
    expect(easeWetness(1, 0, 20, 2, 20)).toBeCloseTo(Math.exp(-1));
  });
});

describe('RainWetness', () => {
  it('stays dry with no rain', () => {
    const wet = new RainWetness();
    for (let i = 0; i < 100; i++) wet.update(0, 1);
    expect(wet.soak).toBe(0);
    expect(wet.film).toBe(0);
  });

  it('wets further in a downpour than a drizzle', () => {
    const drizzle = new RainWetness();
    const downpour = new RainWetness();
    for (let i = 0; i < 300; i++) {
      drizzle.update(0.2, 1);
      downpour.update(1, 1);
    }
    expect(drizzle.soak).toBeCloseTo(0.2, 2);
    expect(downpour.soak).toBeCloseTo(1, 2);
    expect(downpour.film).toBeCloseTo(1, 2);
  });

  it('sheds the film long before the ground dries', () => {
    const wet = new RainWetness();
    for (let i = 0; i < 300; i++) wet.update(1, 1);
    for (let i = 0; i < 60; i++) wet.update(0, 1);
    expect(wet.film).toBeLessThan(0.15);
    expect(wet.soak).toBeGreaterThan(0.3);
  });

  it('lands drops only while rain falls, though the film lingers', () => {
    const wet = new RainWetness();
    for (let i = 0; i < 60; i++) wet.update(0.7, 1);
    expect(wet.falling).toBeCloseTo(0.7);
    wet.update(0, 1);
    expect(wet.falling).toBe(0);
    expect(wet.film).toBeGreaterThan(0.5);
  });

  it('holds an override and scales by the strength', () => {
    const wet = new RainWetness();
    wet.override = 0.8;
    wet.settings.strength = 0.5;
    wet.update(0, 1);
    expect(wet.soak).toBeCloseTo(0.4);
    expect(wet.film).toBeCloseTo(0.4);
  });
});
