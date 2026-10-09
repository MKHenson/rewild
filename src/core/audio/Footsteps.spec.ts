import type { PlayOptions } from 'rewild-audio';
import {
  FIRST_STEP,
  Footsteps,
  FootstepsDef,
  FootstepGround,
  STRIDE_FAST,
  STRIDE_SLOW,
  strideLength,
} from './Footsteps';

const DEF: FootstepsDef = {
  materials: { lawn: 'grass', granite: 'rock', powder: 'snow' },
  surfaces: {
    grass: { sound: 'step-grass', tags: ['soft'] },
    rock: { sound: 'step-rock', tags: ['hard'] },
    snow: { sound: 'step-snow', tags: ['soft'] },
    dirt: { sound: 'step-dirt', tags: ['soft'] },
  },
  fallback: 'dirt',
  rules: [
    {
      id: 'wet-ground',
      when: { wetness: [0.2, 0.7] },
      add: 'step-wet',
      gain: 0.6,
      tags: ['ground'],
    },
    { id: 'wade', when: { immersion: [0.05, 0.4] }, add: 'step-splash' },
    {
      id: 'wade-deep',
      when: { immersion: [0.3, 0.9] },
      scale: '#ground',
      by: 0,
    },
    { id: 'sprint', when: { speed: [7, 14] }, scale: '*', by: 1.4 },
    { id: 'crouch', when: { crouching: [0, 1] }, scale: '*', by: 0.4 },
  ],
};

// Palette channels: lawn, granite, powder, then a material with no map entry.
const PALETTE = ['lawn', 'granite', 'powder', 'clay'];

class Ground implements FootstepGround {
  readonly splatPalette = PALETTE;
  weights = [1, 0, 0, 0];
  loaded = true;

  sampleSplat(_x: number, _z: number, out: Float32Array): boolean {
    if (!this.loaded) return false;
    out.fill(0);
    this.weights.forEach((w, i) => (out[i] = w));
    return true;
  }
}

let played: { name: string; gain: number }[];
let ground: Ground;
let steps: Footsteps;

const sink = {
  play(name: string, options?: PlayOptions): boolean {
    played.push({ name, gain: options?.gain ?? 1 });
    return true;
  },
};

function gainOf(name: string): number {
  return played.find((p) => p.name === name)?.gain ?? 0;
}

beforeEach(() => {
  played = [];
  ground = new Ground();
  steps = new Footsteps(DEF, sink);
  steps.ground = ground;
});

describe('strideLength', () => {
  it('lengthens with speed, within its range', () => {
    expect(strideLength(0)).toBe(STRIDE_SLOW);
    expect(strideLength(6)).toBeGreaterThan(STRIDE_SLOW);
    expect(strideLength(15)).toBe(STRIDE_FAST);
    expect(strideLength(40)).toBe(STRIDE_FAST);
  });
});

describe('Footsteps timing', () => {
  const walk = 6;
  const frame = 1 / 60;

  function walkFor(seconds: number, onFoot = true): void {
    for (let t = 0; t < seconds; t += frame)
      steps.update(walk * frame, frame, onFoot, 0, 0);
  }

  it('steps once a stride, the first after part of one', () => {
    const stride = strideLength(walk);
    const first = stride - STRIDE_SLOW * (1 - FIRST_STEP);
    walkFor(first / walk - frame);
    expect(played).toHaveLength(0);
    walkFor(2 * frame);
    expect(played).toHaveLength(1);
    played = [];
    walkFor(10 * (stride / walk));
    expect(played.length).toBeGreaterThanOrEqual(9);
    expect(played.length).toBeLessThanOrEqual(10);
  });

  it('a sprint steps more often than a walk', () => {
    walkFor(5);
    const walking = played.length;
    played = [];
    for (let t = 0; t < 5; t += frame)
      steps.update(15 * frame, frame, true, 0, 0);
    expect(played.length).toBeGreaterThan(walking);
  });

  it('makes no step off foot or standing still', () => {
    walkFor(3, false);
    for (let t = 0; t < 3; t += frame) steps.update(0, frame, true, 0, 0);
    expect(played).toHaveLength(0);
  });

  it('sets the speed signal from the distance moved', () => {
    steps.update(0.1, 0.02, true, 0, 0);
    expect(steps.signals.get('speed')).toBeCloseTo(5);
  });
});

describe('Footsteps surfaces', () => {
  it('plays the surface of the material underfoot', () => {
    ground.weights = [0, 1, 0, 0];
    steps.step(0, 0);
    expect(played).toEqual([{ name: 'step-rock', gain: 1 }]);
  });

  it('adds a second surface of weight 0.3 or more', () => {
    ground.weights = [0, 0.4, 0.6, 0];
    steps.step(0, 0);
    expect(gainOf('step-snow')).toBe(1);
    expect(gainOf('step-rock')).toBeCloseTo(0.4 / 0.6);
  });

  it('leaves out a second surface below 0.3', () => {
    ground.weights = [0, 0.2, 0.8, 0];
    steps.step(0, 0);
    expect(played.map((p) => p.name)).toEqual(['step-snow']);
  });

  it('sums materials of one surface', () => {
    const def: FootstepsDef = {
      ...DEF,
      materials: { ...DEF.materials, powder: 'rock' },
    };
    steps = new Footsteps(def, sink);
    steps.ground = ground;
    ground.weights = [0.45, 0.3, 0.25, 0];
    steps.step(0, 0);
    expect(gainOf('step-rock')).toBe(1);
    expect(gainOf('step-grass')).toBeCloseTo(0.45 / 0.55);
  });

  it('plays the fallback for an unmapped material', () => {
    ground.weights = [0, 0, 0, 1];
    steps.step(0, 0);
    expect(played).toEqual([{ name: 'step-dirt', gain: 1 }]);
  });

  it('plays the fallback where the ground has no splat', () => {
    ground.loaded = false;
    steps.step(0, 0);
    expect(played).toEqual([{ name: 'step-dirt', gain: 1 }]);
    steps.ground = null;
    played = [];
    steps.step(0, 0);
    expect(played).toEqual([{ name: 'step-dirt', gain: 1 }]);
  });

  it('throws on a surface it does not know', () => {
    expect(() => new Footsteps({ ...DEF, fallback: 'mud' }, sink)).toThrow(
      /mud/
    );
    expect(
      () =>
        new Footsteps(
          { ...DEF, materials: { ...DEF.materials, lawn: 'turf' } },
          sink
        )
    ).toThrow(/turf/);
  });
});

describe('Footsteps rules', () => {
  it('adds a wet layer on wet ground', () => {
    steps.signals.set('wetness', 0.7);
    steps.step(0, 0);
    expect(gainOf('step-wet')).toBeCloseTo(0.6);
    expect(gainOf('step-grass')).toBe(1);
  });

  it('splashes when wading, and only splashes deeper in', () => {
    steps.signals.set('immersion', 0.2);
    steps.step(0, 0);
    expect(gainOf('step-splash')).toBeGreaterThan(0);
    expect(gainOf('step-grass')).toBe(1);

    played = [];
    steps.signals.set('wetness', 1);
    steps.signals.set('immersion', 1);
    steps.step(0, 0);
    expect(played.map((p) => p.name)).toEqual(['step-splash']);
  });

  it('is louder sprinting and softer crouching', () => {
    steps.signals.set('speed', 14);
    steps.step(0, 0);
    expect(gainOf('step-grass')).toBeCloseTo(1.4);

    played = [];
    steps.signals.set('speed', 3);
    steps.signals.set('crouching', 1);
    steps.step(0, 0);
    expect(gainOf('step-grass')).toBeCloseTo(0.4);
  });
});
