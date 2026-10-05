import { Moon, moonIllumination } from './Moon';

describe('Moon', () => {
  it('is dark when new and fully lit when full', () => {
    expect(moonIllumination(0)).toBeCloseTo(0);
    expect(moonIllumination(0.25)).toBeCloseTo(0.5);
    expect(moonIllumination(0.5)).toBeCloseTo(1);
    expect(moonIllumination(1.25)).toBeCloseTo(0.5);
  });

  it('rises as the sun sets when full', () => {
    const moon = new Moon();
    moon.phase = 0.5;
    moon.update(180, 180);
    expect(moon.direction.y).toBeCloseTo(0);
    moon.update(270, 180);
    expect(moon.direction.y).toBeGreaterThan(0.99);
  });

  it('stands high at dusk at first quarter', () => {
    const moon = new Moon();
    moon.phase = 0.25;
    moon.update(180, 180);
    expect(moon.direction.y).toBeGreaterThan(0.99);
  });

  it('sits beside the sun when new rather than across it', () => {
    const moon = new Moon();
    moon.phase = 0;
    moon.update(90, 180);
    expect(moon.direction.length()).toBeCloseTo(1);
    expect(moon.direction.y).toBeLessThan(0.999);
  });

  it('gives no light by day or below the horizon', () => {
    const moon = new Moon();
    moon.phase = 0.5;
    moon.update(90, 180);
    expect(moon.intensity).toBe(0);
    moon.phase = 0.25;
    moon.update(300, 180);
    expect(moon.direction.y).toBeLessThan(0);
    expect(moon.intensity).toBe(0);
  });

  it('lights the night by its phase', () => {
    const moon = new Moon();
    moon.phase = 0.5;
    moon.update(270, 180);
    const full = moon.intensity;
    expect(full).toBeCloseTo(moon.baseIntensity);

    moon.phase = 0.25;
    moon.update(225, 180);
    expect(moon.intensity).toBeGreaterThan(0);
    expect(moon.intensity).toBeLessThan(full);
  });

  it('moves through a month in daysPerCycle days', () => {
    const moon = new Moon();
    moon.phase = 0.5;
    moon.daysPerCycle = 8;
    moon.advance(360 * 2);
    expect(moon.phase).toBeCloseTo(0.75);
    moon.advance(360 * 6);
    expect(moon.phase).toBeCloseTo(0.5);
  });

  it('takes the key light only once sunlight has gone', () => {
    const moon = new Moon();
    expect(moon.isKeyLight(90)).toBe(false);
    expect(moon.isKeyLight(182)).toBe(false);
    expect(moon.isKeyLight(200)).toBe(true);
  });
});
