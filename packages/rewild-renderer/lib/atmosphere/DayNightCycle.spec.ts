import { DayNightCycle, dayPeriod, isDawn, isDusk } from './DayNightCycle';

describe('DayNightCycle', () => {
  it('runs a full day and night in one cycle', () => {
    const cycle = new DayNightCycle();
    cycle.elevation = 0;
    cycle.cycleSeconds = 100;
    for (let i = 0; i < 1000; i++) cycle.advance(0.1);
    expect(cycle.elevation).toBeCloseTo(360);
  });

  it('gives the day its share of the cycle', () => {
    const cycle = new DayNightCycle();
    cycle.elevation = 0;
    cycle.cycleSeconds = 100;
    cycle.dayShare = 0.25;
    expect(cycle.elevationAfter(25)).toBeCloseTo(180);
    expect(cycle.elevationAfter(100)).toBeCloseTo(360);
    expect(cycle.elevationAfter(62.5)).toBeCloseTo(270);
  });

  it('predicts what stepping gives', () => {
    const cycle = new DayNightCycle();
    cycle.elevation = 33;
    cycle.cycleSeconds = 90;
    cycle.dayShare = 0.7;
    const predicted = cycle.elevationAfter(200);
    for (let i = 0; i < 2000; i++) cycle.advance(0.1);
    expect(cycle.elevation).toBeCloseTo(predicted, 3);
  });

  it('holds still while paused', () => {
    const cycle = new DayNightCycle();
    cycle.elevation = 45;
    cycle.paused = true;
    cycle.advance(100);
    expect(cycle.elevation).toBe(45);
    expect(cycle.degreesPerSecond).toBe(0);
  });

  it('names the time of day from the elevation', () => {
    expect(dayPeriod(45)).toBe('morning');
    expect(dayPeriod(135)).toBe('afternoon');
    expect(dayPeriod(225)).toBe('evening');
    expect(dayPeriod(-45)).toBe('night');
    expect(isDawn(350)).toBe(true);
    expect(isDawn(370)).toBe(true);
    expect(isDawn(45)).toBe(false);
    expect(isDusk(170)).toBe(true);
  });
});
