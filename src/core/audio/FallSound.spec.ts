import type { Bed, BedSpec } from 'rewild-audio';
import { FallSound, flapRate, rushCutoff } from './FallSound';

let specs: BedSpec[];
let gains: Record<string, number>;
let rates: Record<string, number>;
let disposed: string[];

const scope = {
  createBed(s: BedSpec): Bed {
    specs.push(s);
    const name = s.sounds[0];
    return {
      set: (gain: number) => (gains[name] = gain),
      setRate: (rate: number) => (rates[name] = rate),
      dispose: () => disposed.push(name),
    } as unknown as Bed;
  },
};

beforeEach(() => {
  specs = [];
  gains = {};
  rates = {};
  disposed = [];
});

describe('rushCutoff', () => {
  it('opens as the fall speeds up', () => {
    expect(rushCutoff(1)).toBeGreaterThan(rushCutoff(0.5));
    expect(rushCutoff(0.5)).toBeGreaterThan(rushCutoff(0));
    expect(rushCutoff(2)).toBe(rushCutoff(1));
  });
});

describe('flapRate', () => {
  it('flaps faster as the fall speeds up', () => {
    expect(flapRate(1)).toBeGreaterThan(flapRate(0));
    expect(flapRate(-1)).toBe(flapRate(0));
  });
});

describe('FallSound', () => {
  it('plays the rush and the flapping on the player bus', () => {
    new FallSound(scope);
    expect(specs.map((s) => s.sounds[0])).toEqual(['fall-rush', 'fall-flap']);
    expect(specs.every((s) => s.bus === 'player')).toBe(true);
  });

  it('follows the freefall', () => {
    const fall = new FallSound(scope);
    fall.update(0);
    expect(gains).toEqual({ 'fall-rush': 0, 'fall-flap': 0 });
    fall.update(0.75);
    expect(gains).toEqual({ 'fall-rush': 0.75, 'fall-flap': 0.75 });
    expect(rates['fall-flap']).toBe(flapRate(0.75));
  });

  it('stops both beds on dispose', () => {
    new FallSound(scope).dispose();
    expect(disposed).toEqual(['fall-rush', 'fall-flap']);
  });
});
