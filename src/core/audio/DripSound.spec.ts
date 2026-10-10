import type { Bed, BedSpec } from 'rewild-audio';
import { DRY_TIME, DripSound, drySoak } from './DripSound';

let spec: BedSpec | null;
let gains: number[];
let disposed: boolean;
let drips: DripSound;

const scope = {
  createBed(s: BedSpec): Bed {
    spec = s;
    return {
      set: (gain: number) => gains.push(gain),
      dispose: () => (disposed = true),
    } as unknown as Bed;
  },
};

const frame = 1 / 60;

function stay(swimming: boolean, immersion: number, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += frame)
    drips.update(swimming, immersion, frame);
}

function last(): number {
  return gains[gains.length - 1];
}

beforeEach(() => {
  spec = null;
  gains = [];
  disposed = false;
  drips = new DripSound(scope);
});

describe('drySoak', () => {
  it('falls by e each DRY_TIME, then to dry', () => {
    expect(drySoak(1, DRY_TIME)).toBeCloseTo(Math.exp(-1));
    expect(drySoak(0.5, 0)).toBe(0.5);
    expect(drySoak(1, DRY_TIME * 10)).toBe(0);
  });
});

describe('DripSound', () => {
  it('plays the drips on the player bus', () => {
    expect(spec).toEqual(
      expect.objectContaining({ sounds: ['body-drips'], bus: 'player' })
    );
  });

  it('is silent before the player has swum', () => {
    stay(false, 0, 2);
    expect(gains.every((g) => g === 0)).toBe(true);
  });

  it('does not drip after wading, however deep', () => {
    stay(false, 2, 2);
    stay(false, 0, 1);
    expect(drips.soak).toBe(0);
    expect(gains.every((g) => g === 0)).toBe(true);
  });

  it('is silent in the water after a swim, and drips on leaving it', () => {
    stay(true, 2.6, 1);
    stay(false, 1, 2);
    expect(last()).toBe(0);
    expect(drips.soak).toBe(1);
    stay(false, 0, frame);
    expect(last()).toBeCloseTo(1, 1);
  });

  it('fades as the body dries', () => {
    stay(true, 2.6, 1);
    stay(false, 0, DRY_TIME);
    expect(last()).toBeCloseTo(Math.exp(-1), 1);
    stay(false, 0, DRY_TIME * 10);
    expect(last()).toBe(0);
    expect(drips.soak).toBe(0);
  });

  it('disposes its bed', () => {
    drips.dispose();
    expect(disposed).toBe(true);
  });
});
