import { Transform } from '../../core/Transform';
import {
  DEFAULT_LIGHTNING_FLASH,
  LightningFlash,
  flickerLight,
  strikeAhead,
  strokeLight,
} from './LightningFlash';

// A fixed sequence, so every flicker has the same strokes.
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const AHEAD = [0, 520, -800];

// The flash runs `seconds` with the strike's flash on for its first 0.18 s,
// sampling the light every frame.
function run(flash: LightningFlash, seconds: number, strike = AHEAD) {
  const frame = 1 / 60;
  const samples: number[] = [];
  for (let t = 0; t < seconds; t += frame) {
    flash.update(frame, t < 0.18 ? 1 : 0, strike, 0, 20, 0, 0, -1);
    samples.push(flash.intensity);
  }
  return samples;
}

describe('strikeAhead', () => {
  it('is full straight ahead and nothing abeam or behind', () => {
    expect(strikeAhead(0, -10, 0, -1)).toBeCloseTo(1);
    expect(strikeAhead(10, 0, 0, -1)).toBeCloseTo(0);
    expect(strikeAhead(0, 10, 0, -1)).toBe(0);
  });
});

describe('flickerLight', () => {
  it('rises fast and falls off a stroke', () => {
    expect(strokeLight(-0.1, 1)).toBe(0);
    expect(strokeLight(0.04, 1)).toBeGreaterThan(0.5);
    expect(strokeLight(0.4, 1)).toBeLessThan(0.01);
  });

  it('pulses again at each later stroke', () => {
    const times = [0, 0.15];
    const strengths = [1, 0.8];
    const between = flickerLight(0.14, times, strengths, 2, 1);
    const second = flickerLight(0.19, times, strengths, 2, 1);
    expect(second).toBeGreaterThan(between * 1.5);
  });

  it('holds an afterglow after the strokes, and lingers longer when told', () => {
    const glow = flickerLight(0.6, [0], [1], 1, 1);
    expect(glow).toBeGreaterThan(0.03);
    expect(flickerLight(0.6, [0], [1], 1, 2)).toBeGreaterThan(glow);
  });
});

describe('LightningFlash', () => {
  it('is dark and hidden between strikes', () => {
    const flash = new LightningFlash(new Transform(), seeded());
    flash.update(1 / 60, 0, AHEAD, 0, 0, 0, 0, -1);
    expect(flash.intensity).toBe(0);
    expect(flash.light.intensity).toBe(0);
    expect(flash.light.transform.visible).toBe(false);
    expect(Array.from(flash.sky)).toEqual([0, 0, 0]);
    expect(flash.glare).toBe(0);
  });

  it('lights from the strike, unshadowed', () => {
    const flash = new LightningFlash(new Transform(), seeded());
    run(flash, 0.05);
    expect(flash.light.shadowed).toBe(false);
    expect(flash.light.transform.visible).toBe(true);
    expect(flash.light.intensity).toBeGreaterThan(
      0.3 * DEFAULT_LIGHTNING_FLASH.light
    );
    const at = flash.light.transform.position;
    expect(at.z).toBeLessThan(0);
    expect(at.y).toBeGreaterThan(0);
    expect(flash.sky[2]).toBeGreaterThan(0);
    expect(flash.glare).toBeGreaterThan(0);
  });

  it('lingers after the strike has gone dark, then goes out', () => {
    const flash = new LightningFlash(new Transform(), seeded());
    const samples = run(flash, 2);
    const at = (seconds: number) => samples[Math.round(seconds * 60)];
    expect(at(0.4)).toBeGreaterThan(0);
    expect(at(1.9)).toBe(0);
    expect(flash.light.transform.visible).toBe(false);
  });

  it('casts no glare from a bolt behind the camera', () => {
    const flash = new LightningFlash(new Transform(), seeded());
    run(flash, 0.05, [0, 520, 800]);
    expect(flash.glare).toBe(0);
    expect(flash.light.intensity).toBeGreaterThan(0);
  });
});
