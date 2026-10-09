import {
  SPEED_OF_SOUND,
  THUNDER_CLOSE_BELOW,
  THUNDER_DUCK_DB,
  THUNDER_LEVEL,
  thunderCutoff,
  thunderDelay,
  thunderDuck,
  thunderDuckLevel,
  thunderGain,
  thunderSound,
} from './thunderMapping';

describe('thunderDelay', () => {
  it('arrives at the speed of sound', () => {
    expect(thunderDelay(700, 0)).toBeCloseTo(700 / SPEED_OF_SOUND, 10);
    expect(thunderDelay(1900, 0)).toBeCloseTo(5.54, 2);
  });

  it('counts from the strike, not from when it is read', () => {
    expect(thunderDelay(686, 0.5)).toBeCloseTo(1.5, 10);
  });
});

describe('thunderSound', () => {
  it('cracks and rumbles near, rumbles far', () => {
    expect(thunderSound(THUNDER_CLOSE_BELOW - 1, 0)).toBe('thunder-close');
    expect(thunderSound(THUNDER_CLOSE_BELOW, 0)).toBe('thunder-far');
  });

  it('plays a short crack for a chained strike', () => {
    expect(thunderSound(800, 1)).toBe('thunder-chain');
    expect(thunderSound(1800, 2)).toBe('thunder-chain');
  });
});

describe('thunderGain', () => {
  it('is at its level near and quieter far', () => {
    expect(thunderGain(500)).toBe(THUNDER_LEVEL);
    expect(thunderGain(700)).toBe(THUNDER_LEVEL);
    expect(thunderGain(1900)).toBeLessThan(THUNDER_LEVEL * 0.5);
    expect(thunderGain(1900)).toBeGreaterThan(THUNDER_LEVEL * 0.4);
  });
});

describe('thunderDuckLevel', () => {
  it('ducks fully under the loudest thunder and less under far thunder', () => {
    expect(thunderDuckLevel(THUNDER_LEVEL)).toBeCloseTo(
      Math.pow(10, THUNDER_DUCK_DB / 20),
      10
    );
    expect(thunderDuckLevel(thunderGain(1900))).toBeGreaterThan(
      thunderDuckLevel(THUNDER_LEVEL)
    );
    expect(thunderDuckLevel(0)).toBe(1);
  });
});

describe('thunderDuck', () => {
  it('waits for the thunder, holds, then lets go', () => {
    expect(thunderDuck(-0.1, 3, 0.25)).toBe(1);
    expect(thunderDuck(0, 3, 0.25)).toBe(0.25);
    expect(thunderDuck(2.9, 3, 0.25)).toBe(0.25);
    const letting = thunderDuck(4, 3, 0.25);
    expect(letting).toBeGreaterThan(0.25);
    expect(letting).toBeLessThan(1);
    expect(thunderDuck(30, 3, 0.25)).toBeCloseTo(1, 4);
  });
});

describe('thunderCutoff', () => {
  it('is deeper far away', () => {
    expect(thunderCutoff(700)).toBeCloseTo(9000, 6);
    expect(thunderCutoff(1900)).toBeCloseTo(1200, 6);
    expect(thunderCutoff(1500)).toBeLessThan(thunderCutoff(1000));
  });
});
