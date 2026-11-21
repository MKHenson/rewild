import { SwimSettings } from './CreaturePresets';
import {
  BURST_GAIN,
  ESCAPE_SNAP,
  ESCAPE_SPRING,
  HOVER_SHARE,
  SwimDriver,
  SwimTarget,
} from './SwimDriver';

const SWIM: SwimSettings = {
  stiff: 0.5,
  wavelength: 1.2,
  amplitude: 0.4,
  stride: 1,
  hoverBeat: 0.5,
  maxBeat: 10,
  turnCurve: 0.5,
};
const LENGTH = 0.8;
const DT = 1 / 60;

class Target implements SwimTarget {
  phase = 0;
  amplitude = 0;
  curve = 0;
  weight = 0;

  setChainWave(
    phase: number,
    amplitude: number,
    curve: number,
    weight: number
  ) {
    this.phase = phase;
    this.amplitude = amplitude;
    this.curve = curve;
    this.weight = weight;
  }
}

function setup(settings: SwimSettings = SWIM, random = () => 0.5) {
  const target = new Target();
  const driver = new SwimDriver(settings, LENGTH, target, null, random);
  const source = {
    speed: 0,
    heading: 0,
    stranded: false,
    activeMode: 'wander' as string | null,
  };
  driver.reset(0);
  const run = (seconds: number, yawRate = 0) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      source.heading += yawRate * DT;
      driver.update(DT, source);
    }
  };
  return { driver, target, source, run };
}

describe('SwimDriver', () => {
  it('beats faster as it swims faster, one beat a stride', () => {
    const { driver, source, run } = setup();
    source.speed = 1;
    run(0.5);
    expect(driver.frequency).toBeCloseTo(1);

    source.speed = 2.5;
    run(0.5);
    expect(driver.frequency).toBeCloseTo(2.5);
    expect(driver.amplitude).toBeCloseTo(SWIM.amplitude, 2);
  });

  it('builds the phase up, so a change of speed never jumps it', () => {
    const { driver, source } = setup();
    source.speed = 1;
    driver.update(DT, source);
    const before = driver.phase;
    source.speed = 3;
    driver.update(DT, source);

    expect(driver.phase - before).toBeCloseTo(Math.PI * 2 * 3 * DT, 5);
  });

  it('hovers with a small slow beat when still', () => {
    const { driver, run } = setup();
    run(1);

    expect(driver.gait).toBe('hover');
    expect(driver.frequency).toBe(SWIM.hoverBeat);
    expect(driver.amplitude).toBeCloseTo(SWIM.amplitude * HOVER_SHARE, 2);
  });

  it('curves the spine to lie along the arc it swims, up to its limit', () => {
    const { driver, source, run } = setup();
    source.speed = 2;
    run(1.5, 1);
    expect(driver.curve).toBeCloseTo((LENGTH * 1) / 2, 2);

    run(1.5, -0.5);
    expect(driver.curve).toBeCloseTo((LENGTH * -0.5) / 2, 2);

    run(1.5, 3);
    expect(driver.curve).toBeCloseTo(SWIM.turnCurve, 2);

    run(1.5);
    expect(driver.curve).toBeCloseTo(0, 2);
  });

  it('bursts then coasts with a straight body, and bursts again', () => {
    const burst = {
      beats: [2, 2] as [number, number],
      coast: [2, 2] as [number, number],
    };
    const { driver, source, run } = setup({ ...SWIM, burst });
    source.speed = 1;
    driver.update(DT, source);
    expect(driver.gait).toBe('burst');
    expect(driver.frequency).toBeCloseTo(BURST_GAIN);

    run(2 / BURST_GAIN);
    expect(driver.gait).toBe('coast');
    run(0.9);
    expect(driver.amplitude).toBeLessThan(0.01);

    run(0.8);
    expect(driver.gait).toBe('burst');
  });

  it('snaps into a C as it starts to flee, then springs out', () => {
    const { driver, target, source, run } = setup({ ...SWIM, escape: 1.2 });
    source.speed = 1;
    run(0.5);
    source.activeMode = 'evade';
    source.heading += 0.02;
    driver.update(DT, source);
    expect(driver.gait).toBe('escape');

    run(ESCAPE_SNAP - DT);
    expect(target.curve).toBeCloseTo(1.2, 1);

    run(ESCAPE_SPRING);
    expect(Math.abs(target.curve)).toBeLessThan(0.15);
    run(DT * 2);
    expect(driver.gait).toBe('cruise');
  });

  it('escapes once as the flee starts, not again while it lasts', () => {
    const { driver, source, run } = setup({ ...SWIM, escape: 1.2 });
    source.speed = 1;
    source.activeMode = 'evade';
    driver.update(DT, source);
    expect(driver.gait).toBe('escape');

    run(1);
    expect(driver.gait).toBe('cruise');
  });

  it('lies still when stranded', () => {
    const { driver, source, run } = setup();
    source.speed = 1;
    run(0.5, 1);
    source.stranded = true;
    run(2);

    expect(driver.amplitude).toBeLessThan(0.01);
    expect(Math.abs(driver.curve)).toBeLessThan(0.01);
  });

  it('sends its wave to the target at full weight', () => {
    const { driver, target, source } = setup();
    source.speed = 1;
    driver.update(DT, source);

    expect(target.phase).toBe(driver.phase);
    expect(target.amplitude).toBe(driver.amplitude);
    expect(target.weight).toBe(1);
  });
});

describe('SwimDriver dash', () => {
  function dashing(settings: SwimSettings) {
    const played: string[] = [];
    const driver = new SwimDriver(
      settings,
      LENGTH,
      new Target(),
      {
        play: (meaning) => {
          played.push(meaning);
          return true;
        },
      },
      () => 0.5
    );
    driver.reset(0);
    const source = {
      speed: 1,
      heading: 0,
      stranded: false,
      activeMode: 'wander' as string | null,
    };
    return { driver, played, source };
  }

  it('dashes as it starts to flee', () => {
    const { driver, played, source } = dashing({
      ...SWIM,
      escape: 1.2,
      dash: { meaning: 'dash', chance: 0 },
    });
    driver.update(DT, source);
    expect(played).toEqual([]);

    source.activeMode = 'evade';
    driver.update(DT, source);
    expect(played).toEqual(['dash']);
  });

  it('dashes by chance as a burst starts', () => {
    const burst = {
      beats: [2, 2] as [number, number],
      coast: [1, 1] as [number, number],
    };
    const sure = dashing({
      ...SWIM,
      burst,
      dash: { meaning: 'dash', chance: 1 },
    });
    sure.driver.update(DT, sure.source);
    expect(sure.played).toEqual(['dash']);

    const never = dashing({
      ...SWIM,
      burst,
      dash: { meaning: 'dash', chance: 0 },
    });
    never.driver.update(DT, never.source);
    expect(never.played).toEqual([]);
  });
});

describe('SwimDriver beat limit', () => {
  it('never beats faster than its limit, even in a burst', () => {
    const burst = {
      beats: [20, 20] as [number, number],
      coast: [1, 1] as [number, number],
    };
    const { driver, source, run } = setup({ ...SWIM, maxBeat: 2, burst });
    source.speed = 5;
    run(0.5);

    expect(driver.gait).toBe('burst');
    expect(driver.frequency).toBe(2);
  });
});
