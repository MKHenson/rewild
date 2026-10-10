import type { Bed, BedSpec, PlayOptions } from 'rewild-audio';
import { SLIDE_MAX_SPEED } from '../routing/utils/Sliding';
import { Footsteps, FootstepsDef } from './Footsteps';
import {
  DEBRIS_FAR,
  DEBRIS_NEAR,
  SLIDING_FROM,
  SLIP_REST,
  SlideGround,
  SlideInput,
  SlideSound,
  debrisInterval,
  slideCutoff,
  slideGain,
  slideRate,
} from './SlideSound';

interface Played {
  name: string;
  bus?: string;
  gain: number;
  at?: { x: number; y: number; z: number };
}

interface FakeBed {
  sound: string;
  gain: number;
  rate: number;
  disposed: boolean;
}

const DEF: FootstepsDef = {
  materials: { powder: 'snow', granite: 'rock' },
  surfaces: {
    snow: { sound: 'step-snow', slide: 'slide-snow' },
    rock: { sound: 'step-rock' },
    dirt: { sound: 'step-dirt' },
  },
  fallback: 'dirt',
};

class Ground implements SlideGround {
  readonly splatPalette = ['powder', 'granite'];
  weights = [0, 1];
  height = 50;

  sampleSplat(_x: number, _z: number, out: Float32Array): boolean {
    out.fill(0);
    this.weights.forEach((w, i) => (out[i] = w));
    return true;
  }

  sampleHeight(): number | null {
    return this.height;
  }
}

let played: Played[];
let beds: FakeBed[];
let ground: Ground;
let input: SlideInput;
let slide: SlideSound;

const scope = {
  play(name: string, options?: PlayOptions): boolean {
    const at = options?.at;
    played.push({
      name,
      bus: options?.bus,
      gain: options?.gain ?? 1,
      at: at ? { x: at.x, y: at.y, z: at.z } : undefined,
    });
    return true;
  },
  createBed(spec: BedSpec): Bed {
    const bed: FakeBed = {
      sound: spec.sounds[0],
      gain: 0,
      rate: 1,
      disposed: false,
    };
    beds.push(bed);
    return {
      set: (gain: number) => (bed.gain = gain),
      setRate: (rate: number) => (bed.rate = rate),
      dispose: () => (bed.disposed = true),
    } as unknown as Bed;
  },
};

const frame = 1 / 60;

function bed(sound: string): FakeBed {
  return beds.find((b) => b.sound === sound)!;
}

function names(): string[] {
  return played.map((p) => p.name);
}

function run(seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += frame) slide.update(input, frame);
}

/** Slides downhill toward +x at `speed`. */
function sliding(speed: number): void {
  input.onGround = true;
  input.grounded = false;
  input.slideX = speed;
  input.slideZ = 0;
}

beforeEach(() => {
  played = [];
  beds = [];
  ground = new Ground();
  input = {
    x: 0,
    y: 100,
    z: 0,
    onGround: true,
    grounded: true,
    slideX: 0,
    slideZ: 0,
    climbing: false,
    ground,
  };
  const footsteps = new Footsteps(DEF, { play: () => true });
  footsteps.ground = ground;
  slide = new SlideSound(scope, footsteps);
  slide.random = () => 0.5;
});

describe('slide mapping', () => {
  it('gets louder, higher and brighter as the slide speeds up', () => {
    const slow = SLIDING_FROM;
    const fast = SLIDE_MAX_SPEED;
    expect(slideGain(fast)).toBe(1);
    expect(slideGain(slow)).toBeLessThan(slideGain(fast));
    expect(slideRate(slow)).toBeLessThan(slideRate(fast));
    expect(slideCutoff(slow)).toBeLessThan(slideCutoff(fast));
  });

  it('sends debris more often the faster the slide', () => {
    expect(debrisInterval(SLIDE_MAX_SPEED)).toBeLessThan(
      debrisInterval(SLIDING_FROM)
    );
  });
});

describe('SlideSound loop', () => {
  it('has one loop per slide sound the surfaces name', () => {
    expect(beds.map((b) => b.sound).sort()).toEqual([
      'slide-crumble',
      'slide-snow',
    ]);
  });

  it('is silent standing, and crumbles while sliding', () => {
    run(0.5);
    expect(bed('slide-crumble').gain).toBe(0);
    sliding(SLIDE_MAX_SPEED);
    run(frame);
    expect(bed('slide-crumble').gain).toBe(1);
    expect(bed('slide-crumble').rate).toBe(slideRate(SLIDE_MAX_SPEED));
    expect(bed('slide-snow').gain).toBe(0);
  });

  it('hisses on snow, and blends where snow meets rock', () => {
    sliding(SLIDE_MAX_SPEED);
    ground.weights = [1, 0];
    run(frame);
    expect(bed('slide-snow').gain).toBe(1);
    expect(bed('slide-crumble').gain).toBe(0);
    ground.weights = [0.5, 0.5];
    run(frame);
    expect(bed('slide-snow').gain).toBeCloseTo(0.5);
    expect(bed('slide-crumble').gain).toBeCloseTo(0.5);
  });

  it('makes no sound sliding through the air', () => {
    sliding(SLIDE_MAX_SPEED);
    input.onGround = false;
    run(1);
    expect(bed('slide-crumble').gain).toBe(0);
    expect(played).toHaveLength(0);
  });

  it('crumbles with one loop where there are no footsteps', () => {
    beds = [];
    slide = new SlideSound(scope, null);
    expect(beds.map((b) => b.sound)).toEqual(['slide-crumble']);
    sliding(SLIDE_MAX_SPEED);
    run(frame);
    expect(bed('slide-crumble').gain).toBe(1);
  });

  it('stops its loops on dispose', () => {
    slide.dispose();
    expect(beds.every((b) => b.disposed)).toBe(true);
  });
});

describe('SlideSound slip', () => {
  it('slips once as a slide starts, at the feet', () => {
    sliding(4);
    run(1);
    expect(played.filter((p) => p.name === 'slide-slip')).toEqual([
      { name: 'slide-slip', bus: 'player', gain: 1, at: undefined },
    ]);
  });

  it('does not slip again for a slide that only flickers', () => {
    sliding(4);
    run(frame);
    input.slideX = 0;
    run(SLIP_REST / 2);
    input.slideX = 4;
    run(frame);
    expect(names().filter((n) => n === 'slide-slip')).toHaveLength(1);
  });
});

describe('SlideSound debris', () => {
  it('falls away downhill, in the world, on the ground there', () => {
    sliding(SLIDE_MAX_SPEED);
    run(1);
    const debris = played.filter((p) => p.name.startsWith('slide-debris'));
    expect(debris.length).toBeGreaterThan(1);
    for (const d of debris) {
      expect(d.bus).toBe('effects');
      expect(d.at!.x).toBeGreaterThanOrEqual(DEBRIS_NEAR);
      expect(d.at!.x).toBeLessThanOrEqual(DEBRIS_FAR);
      expect(d.at!.y).toBe(ground.height);
    }
  });

  it('sends more debris in a faster slide', () => {
    sliding(SLIDING_FROM + 0.1);
    run(5);
    const slow = names().filter((n) => n.startsWith('slide-debris')).length;
    played = [];
    sliding(SLIDE_MAX_SPEED);
    run(5);
    const fast = names().filter((n) => n.startsWith('slide-debris')).length;
    expect(fast).toBeGreaterThan(slow);
  });

  it('falls below the feet where the ground has no height', () => {
    ground.sampleHeight = () => null;
    sliding(SLIDE_MAX_SPEED);
    run(0.5);
    const d = played.find((p) => p.name.startsWith('slide-debris'))!;
    expect(d.at!.y).toBe(input.y - d.at!.x);
  });
});

describe('SlideSound spill', () => {
  it('spills from the edge when a fast slide leaves the ground', () => {
    sliding(SLIDE_MAX_SPEED);
    input.x = 7;
    run(frame);
    played = [];
    input.onGround = false;
    run(frame);
    expect(names().sort()).toEqual([
      'slide-debris-crumble',
      'slide-debris-stones',
    ]);
    expect(played[0].at).toEqual({ x: 7, y: 100, z: 0 });
    played = [];
    run(1);
    expect(played).toHaveLength(0);
  });

  it('does not spill on a jump or from a slow slide', () => {
    sliding(SLIDE_MAX_SPEED);
    run(frame);
    played = [];
    slide.jumped();
    input.onGround = false;
    run(frame);
    expect(played).toHaveLength(0);

    sliding(1);
    run(frame);
    played = [];
    input.onGround = false;
    run(frame);
    expect(played).toHaveLength(0);
  });
});

describe('SlideSound scrabble', () => {
  it('scrabbles while pushing up ground too steep to climb', () => {
    input.grounded = false;
    input.climbing = true;
    run(frame);
    expect(names()).toEqual(['slide-scrabble']);
    run(2);
    const scrabbles = names().filter((n) => n === 'slide-scrabble').length;
    expect(scrabbles).toBeGreaterThan(4);
    expect(played.every((p) => p.bus === 'player')).toBe(true);
  });

  it('stops when the player stops pushing, or on walkable ground', () => {
    input.grounded = false;
    run(1);
    input.grounded = true;
    input.climbing = true;
    run(1);
    expect(played).toHaveLength(0);
  });
});
