import type { PlayOptions } from 'rewild-audio';
import {
  DIVE_STROKE_EVERY,
  DIVE_STROKE_EVERY_FAST,
  FIRST_STROKE,
  STROKE_EVERY,
  STROKE_EVERY_FAST,
  SwimSound,
  strokeInterval,
} from './SwimSound';

let played: string[];
let buses: (string | undefined)[];
let swim: SwimSound;

const sink = {
  play(name: string, options?: PlayOptions): boolean {
    played.push(name);
    buses.push(options?.bus);
    return true;
  },
};

const frame = 1 / 60;

function swimFor(
  seconds: number,
  under = false,
  moving = true,
  fast = false,
  swimming = true
): void {
  for (let t = 0; t < seconds - 1e-9; t += frame)
    swim.update(swimming, under, moving, fast, frame);
}

beforeEach(() => {
  played = [];
  buses = [];
  swim = new SwimSound(sink);
  swim.random = () => 1;
});

describe('strokeInterval', () => {
  it('is slower under water and quicker sprinting', () => {
    expect(strokeInterval(false, false)).toBe(STROKE_EVERY);
    expect(strokeInterval(false, true)).toBe(STROKE_EVERY_FAST);
    expect(strokeInterval(true, false)).toBe(DIVE_STROKE_EVERY);
    expect(strokeInterval(true, true)).toBe(DIVE_STROKE_EVERY_FAST);
    expect(STROKE_EVERY_FAST).toBeLessThan(STROKE_EVERY);
    expect(DIVE_STROKE_EVERY).toBeGreaterThan(STROKE_EVERY);
  });
});

describe('SwimSound', () => {
  it('strokes soon after starting, then once an interval', () => {
    swimFor(FIRST_STROKE + 2 * frame);
    expect(played).toEqual(['swim-stroke']);
    swimFor(STROKE_EVERY * 10);
    expect(played.length).toBeGreaterThanOrEqual(10);
    expect(played.length).toBeLessThanOrEqual(11);
  });

  it('makes no stroke floating still or out of the water', () => {
    swimFor(5, false, false);
    swimFor(5, false, true, false, false);
    expect(played).toEqual(['swim-emerge']);
  });

  it('strokes muffled under water, slower than at the surface', () => {
    swimFor(10, true);
    const dives = played.length;
    expect(new Set(played)).toEqual(new Set(['swim-stroke-under']));
    played = [];
    swimFor(10);
    expect(played.length).toBeGreaterThan(dives);
  });

  it('lets out bubbles with some strokes under water only', () => {
    swim.random = () => 0;
    swimFor(FIRST_STROKE + 2 * frame, true);
    expect(played).toEqual(['swim-stroke-under', 'swim-bubbles']);
    expect(buses).toEqual(['player', 'effects']);
    played = [];
    swim.update(false, false, false, false, frame);
    played = [];
    swimFor(FIRST_STROKE + 2 * frame);
    expect(played).toEqual(['swim-stroke']);
  });

  it('emerges once on standing up out of a swim', () => {
    swimFor(1, false, false);
    expect(played).toHaveLength(0);
    swimFor(1, false, false, false, false);
    expect(played).toEqual(['swim-emerge']);
  });

  it('does not emerge without having swum', () => {
    swimFor(1, false, true, false, false);
    expect(played).toHaveLength(0);
  });

  it('starts over after stopping', () => {
    swimFor(FIRST_STROKE + 2 * frame);
    swimFor(STROKE_EVERY / 2);
    swim.update(true, false, false, false, frame);
    played = [];
    swimFor(FIRST_STROKE + 2 * frame);
    expect(played).toEqual(['swim-stroke']);
  });

  it('says when a stroke at the surface played', () => {
    swim.update(true, false, true, false, FIRST_STROKE + frame);
    expect(swim.stroked).toBe(true);
    swim.update(true, false, true, false, frame);
    expect(swim.stroked).toBe(false);
    swim.update(true, true, true, false, DIVE_STROKE_EVERY + frame);
    expect(played).toContain('swim-stroke-under');
    expect(swim.stroked).toBe(false);
  });
});
