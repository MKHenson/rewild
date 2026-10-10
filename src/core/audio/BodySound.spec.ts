import type { PlayOptions } from 'rewild-audio';
import { BodySound, LAND_FROM, landingGain, landingSound } from './BodySound';

let played: { name: string; gain: number; bus?: string }[];
let body: BodySound;

const sink = {
  play(name: string, options?: PlayOptions): boolean {
    played.push({ name, gain: options?.gain ?? 1, bus: options?.bus });
    return true;
  },
};

beforeEach(() => {
  played = [];
  body = new BodySound(sink);
});

describe('landingSound', () => {
  it('is silent below LAND_FROM', () => {
    expect(landingSound(LAND_FROM - 0.1, false)).toBeNull();
    expect(landingSound(0, false)).toBeNull();
  });

  it('thuds from LAND_FROM, and hard when the fall hurt', () => {
    expect(landingSound(LAND_FROM, false)).toBe('land');
    expect(landingSound(10.5, false)).toBe('land');
    expect(landingSound(16, true)).toBe('land-hard');
  });
});

describe('landingGain', () => {
  it('rises with the fall speed to 1', () => {
    expect(landingGain(LAND_FROM)).toBeCloseTo(0.3);
    expect(landingGain(10.5)).toBeGreaterThan(landingGain(5));
    expect(landingGain(15)).toBe(1);
    expect(landingGain(40)).toBe(1);
  });
});

describe('BodySound', () => {
  it('pushes off on a jump', () => {
    body.jump();
    expect(played).toEqual([{ name: 'jump', gain: 1, bus: 'player' }]);
  });

  it('lands sized by the fall, and says whether it played', () => {
    expect(body.land(1, false)).toBe(false);
    expect(played).toHaveLength(0);
    expect(body.land(10.5, false)).toBe(true);
    expect(played[0].name).toBe('land');
    expect(played[0].gain).toBeCloseTo(landingGain(10.5));
  });

  it('lands hard at full gain when the fall hurt', () => {
    expect(body.land(18, true)).toBe(true);
    expect(played).toEqual([{ name: 'land-hard', gain: 1, bus: 'player' }]);
  });

  it('clicks the flashlight', () => {
    body.flashlight();
    expect(played).toEqual([{ name: 'flashlight', gain: 1, bus: 'player' }]);
  });
});
