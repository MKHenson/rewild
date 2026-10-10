import {
  BODY_EASE,
  BodyTemperature,
  coldTarget,
  heatTarget,
} from './BodyTemperature';

const frame = 1 / 60;

function run(
  body: BodyTemperature,
  seconds: number,
  temperature: number,
  sun = 0.8,
  swimming = false
): void {
  for (let t = 0; t < seconds - 1e-9; t += frame)
    body.update(temperature, sun, 0.1, 0, 0, swimming, 0, frame);
}

describe('heatTarget', () => {
  it('heats the body in a hot sun, not at night or in a mild one', () => {
    expect(heatTarget(1, 0.8, 0)).toBeGreaterThan(0.6);
    expect(heatTarget(1, 0.8, 1)).toBeGreaterThan(heatTarget(1, 0.8, 0));
    expect(heatTarget(0.85, -0.3, 1)).toBe(0);
    expect(heatTarget(0.6, 0.8, 1)).toBe(0);
  });
});

describe('coldTarget', () => {
  it('chills the body in cold air, wind, snow and when wet', () => {
    expect(coldTarget(0.1, 0, 0, 0)).toBeGreaterThan(0.6);
    expect(coldTarget(0.5, 0.2, 0, 0)).toBe(0);
    expect(coldTarget(0.25, 1, 0, 0)).toBeGreaterThan(
      coldTarget(0.25, 0, 0, 0)
    );
    expect(coldTarget(0.35, 0, 0, 1)).toBeGreaterThan(0);
    expect(coldTarget(0.25, 0, 1, 0)).toBeGreaterThan(
      coldTarget(0.25, 0, 0, 0)
    );
    expect(coldTarget(0, 1, 1, 1)).toBe(1);
  });
});

describe('BodyTemperature', () => {
  it('stays normal in mild weather', () => {
    const body = new BodyTemperature();
    run(body, 60, 0.5);
    expect(body.value).toBeCloseTo(0, 5);
    expect(body.heat).toBe(0);
    expect(body.cold).toBe(0);
  });

  it('heats up slowly in a hot sun and cools back down', () => {
    const body = new BodyTemperature();
    run(body, BODY_EASE, 1);
    const target = heatTarget(1, 0.8, 0);
    expect(body.value).toBeCloseTo(target * (1 - Math.exp(-1)), 2);
    run(body, 60, 1);
    expect(body.heat).toBeCloseTo(target, 2);
    run(body, 60, 0.5);
    expect(body.value).toBeCloseTo(0, 2);
  });

  it('goes cold below zero', () => {
    const body = new BodyTemperature();
    run(body, 60, 0.1);
    expect(body.value).toBeLessThan(-0.6);
    expect(body.cold).toBe(-body.value);
    expect(body.heat).toBe(0);
  });

  it('stays wet after a swim and dries over time', () => {
    const body = new BodyTemperature();
    run(body, 1, 0.4, 0.8, true);
    expect(body.wet).toBe(1);
    run(body, 10, 0.4);
    expect(body.wet).toBeGreaterThan(0.7);
    expect(body.value).toBeLessThan(0);
    run(body, 300, 0.4);
    expect(body.wet).toBeLessThan(0.01);
  });

  it('stays where it is put while held', () => {
    const body = new BodyTemperature();
    body.value = 0.8;
    body.held = true;
    run(body, 60, 0.5);
    expect(body.value).toBe(0.8);
    body.held = false;
    run(body, 60, 0.5);
    expect(body.value).toBeCloseTo(0, 2);
  });

  it('is normal and dry on reset', () => {
    const body = new BodyTemperature();
    run(body, 30, 0.1, 0.8, true);
    body.reset();
    expect(body.value).toBe(0);
    expect(body.wet).toBe(0);
  });
});
