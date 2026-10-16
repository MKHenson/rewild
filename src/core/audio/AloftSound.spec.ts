import { Vector3 } from 'rewild-common';
import type { Bed, BedSpec } from 'rewild-audio';
import { ALOFT_FROM, ALOFT_FULL, AloftSound, aloftShare } from './AloftSound';

let spec: BedSpec | null;
let gains: number[];
const listenerPosition = new Vector3();

const scope = {
  createBed(s: BedSpec): Bed {
    spec = s;
    return { set: (gain: number) => gains.push(gain) } as unknown as Bed;
  },
};

beforeEach(() => {
  spec = null;
  gains = [];
  listenerPosition.set(0, 0, 0);
});

describe('aloftShare', () => {
  it('is 0 below the deck and 1 above it', () => {
    expect(aloftShare(0)).toBe(0);
    expect(aloftShare(ALOFT_FROM)).toBe(0);
    expect(aloftShare(ALOFT_FULL)).toBe(1);
    expect(aloftShare(10000)).toBe(1);
  });

  it('rises through the deck', () => {
    const mid = aloftShare((ALOFT_FROM + ALOFT_FULL) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('AloftSound', () => {
  it('plays on the world bus, past the ducks', () => {
    new AloftSound({ listenerPosition }, scope);
    expect(spec).toEqual(
      expect.objectContaining({ sounds: ['aloft'], bus: 'world' })
    );
  });

  it('follows the listener up', () => {
    const aloft = new AloftSound({ listenerPosition }, scope);
    aloft.update();
    expect(gains.pop()).toBe(0);
    listenerPosition.y = ALOFT_FULL;
    aloft.update();
    expect(gains.pop()).toBe(1);
    expect(aloft.share).toBe(1);
  });
});
