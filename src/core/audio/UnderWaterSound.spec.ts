import { AudioEngine, OPEN_CUTOFF_HZ } from 'rewild-audio';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeGainNode,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import {
  PLUNGE_BIG_AT,
  PLUNGE_BIG_DEPTH,
  PLUNGE_FROM,
  SURFACE_AFTER,
  UNDER_WATER_CUTOFF,
  UNDER_WATER_LEVEL,
  UnderWaterSound,
  plungeGain,
  plungeSound,
} from './UnderWaterSound';

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'under-water': 1000,
  'plunge-small': 2000,
  'plunge-big': 2001,
  surface: 3000,
};

const manifest = {
  sounds: Object.keys(LENGTHS).map((name) => ({
    name,
    files: [name],
    loop: name === 'under-water',
    source: 'test',
    license: 'own',
  })),
};

let restore: () => void;
let engine: AudioEngine;
let water: UnderWaterSound;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sourcesOf(name: string): FakeAudioBufferSourceNode[] {
  return ctx().sources.filter((s) => s.buffer?.length === LENGTHS[name]);
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  engine = new AudioEngine(
    undefined,
    async (url) => new ArrayBuffer(LENGTHS[url])
  );
  engine.bank.random = () => 0.5;
  await engine.start();
  await engine.loadSounds(manifest);
  water = new UnderWaterSound(engine, engine.createScope());
});

afterEach(() => {
  restore();
});

/** Player.verticalVelocity down as a jump on flat ground lands. */
const JUMP_LANDING = 10.5;

describe('plungeSound', () => {
  it('makes no plunge wading in', () => {
    expect(plungeSound(0, 5)).toBeNull();
    expect(plungeSound(PLUNGE_FROM - 0.1, 5)).toBeNull();
  });

  it('makes a small plunge for a step in and a big one for a fall', () => {
    expect(plungeSound(PLUNGE_FROM, 5)).toBe('plunge-small');
    expect(plungeSound(PLUNGE_BIG_AT, 5)).toBe('plunge-big');
  });

  it('makes a small plunge for a jump on flat ground', () => {
    expect(plungeSound(JUMP_LANDING, 5)).toBe('plunge-small');
  });

  it('makes no big plunge in the shallows', () => {
    expect(plungeSound(30, PLUNGE_BIG_DEPTH - 0.1)).toBe('plunge-small');
  });
});

describe('plungeGain', () => {
  it('rises with the speed of the fall', () => {
    expect(plungeGain(PLUNGE_FROM, 5)).toBeCloseTo(0.4, 6);
    expect(plungeGain(10, 5)).toBeGreaterThan(plungeGain(4, 5));
    expect(plungeGain(30, 5)).toBe(1);
  });

  it('is softer into shallow water', () => {
    expect(plungeGain(JUMP_LANDING, 0.1)).toBeLessThan(
      plungeGain(JUMP_LANDING, 5) / 2
    );
  });
});

describe('UnderWaterSound', () => {
  it('plunges as the feet hit the water, sized by the fall', () => {
    water.update(0, 5, false, -16, 0.1);
    water.update(0.2, 5, false, -16, 0.1);
    const [big] = sourcesOf('plunge-big');
    expect(big).toBeDefined();
    expect(big.outputs[0].outputs[0]).toBe(engine.bus('effects'));
    water.update(0.4, 5, false, -1, 0.1);
    expect(sourcesOf('plunge-big')).toHaveLength(1);
  });

  it('plays a small plunge for a jump into the shallows', () => {
    water.update(0, 0.2, false, -JUMP_LANDING, 0.1);
    water.update(0.1, 0.2, false, -JUMP_LANDING, 0.1);
    expect(sourcesOf('plunge-small')).toHaveLength(1);
    expect(sourcesOf('plunge-big')).toHaveLength(0);
  });

  it('makes no plunge wading in', () => {
    water.update(0, 5, false, 0, 0.1);
    water.update(0.1, 5, false, 0, 0.1);
    expect(sourcesOf('plunge-small')).toHaveLength(0);
    expect(sourcesOf('plunge-big')).toHaveLength(0);
  });

  it('muffles the world and plays the bed with the camera under', () => {
    water.update(2, 5, true, 0, 0.1);
    expect(engine.muffleCutoff).toBe(UNDER_WATER_CUTOFF);
    expect(engine.muffleLevel).toBe(UNDER_WATER_LEVEL);
    const [bed] = sourcesOf('under-water');
    expect(bed).toBeDefined();
    const out = bed.outputs[0].outputs[0] as FakeGainNode;
    expect(out.gain.lastTarget!.value).toBe(1);
    expect(out.outputs).toEqual([engine.bus('player')]);
  });

  it('lifts the muffle and splashes on surfacing', () => {
    water.update(2, 5, true, 0, SURFACE_AFTER);
    water.update(2, 5, true, 0, 0.1);
    water.update(1, 5, false, 0, 0.1);
    expect(engine.muffleCutoff).toBe(OPEN_CUTOFF_HZ);
    expect(engine.muffleLevel).toBe(1);
    expect(sourcesOf('surface')).toHaveLength(1);
  });

  it('does not splash when the camera only dips under', () => {
    water.update(2, 5, true, 0, 0.1);
    water.update(1, 5, false, 0, 0.1);
    expect(sourcesOf('surface')).toHaveLength(0);
  });

  it('lifts the muffle when disposed under water', () => {
    water.update(2, 5, true, 0, 0.1);
    water.dispose();
    expect(engine.muffleCutoff).toBe(OPEN_CUTOFF_HZ);
    expect(engine.muffleLevel).toBe(1);
  });
});
