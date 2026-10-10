import { AudioEngine } from 'rewild-audio';
import {
  FakeAudioContext,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import { Footsteps, FootstepsDef } from './Footsteps';
import { DEATH_AFTER_THUD, PlayerSounds } from './PlayerSounds';
import { SLIDING_FROM } from './SlideSound';
import { VoiceDef, VoiceSound } from './VoiceSound';
import { DAZED_LEVEL, DEAD_CUTOFF, DEAD_LEVEL } from './UnderWaterSound';

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'under-water': 1000,
  'body-drips': 1001,
  'step-dirt': 2000,
  land: 3000,
  'land-hard': 3001,
  jump: 3002,
  flashlight: 3003,
  'swim-stroke': 4000,
  'breath-swim': 4001,
  death: 5000,
};

const manifest = {
  sounds: Object.keys(LENGTHS).map((name) => ({
    name,
    files: [name],
    loop: name === 'under-water' || name === 'body-drips',
    source: 'test',
  })),
};

const VOICE: VoiceDef = {
  layers: [{ id: 'calm', sound: 'under-water', tags: ['mouth'] }],
};

const FOOTSTEPS: FootstepsDef = {
  materials: {},
  surfaces: { dirt: { sound: 'step-dirt' } },
  fallback: 'dirt',
};

let restore: () => void;
let engine: AudioEngine;
let sounds: PlayerSounds;

function played(name: string): number {
  const ctx = engine.context as unknown as FakeAudioContext;
  return ctx.sources.filter(
    (s) => s.buffer?.length === LENGTHS[name] && s.startedAt !== null
  ).length;
}

const frame = 1 / 60;

function now(): number {
  return (engine.context as unknown as FakeAudioContext).currentTime;
}

/** When the death sound starts, on the audio clock. */
function deathStart(): number {
  const ctx = engine.context as unknown as FakeAudioContext;
  return ctx.sources.find((s) => s.buffer?.length === LENGTHS.death)!
    .startedAt!;
}

/** Stands the player on flat ground for a frame. */
function stand(): void {
  const s = sounds.state;
  s.onGround = true;
  s.grounded = true;
  s.fallSpeed = 0;
  s.hurt = false;
  sounds.update(frame);
}

/** Has the player in the air for a frame. */
function fall(): void {
  const s = sounds.state;
  s.onGround = false;
  s.grounded = false;
  sounds.update(frame);
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
  sounds = new PlayerSounds(engine, engine.createScope(), FOOTSTEPS);
});

afterEach(() => {
  sounds.dispose();
  restore();
});

describe('PlayerSounds', () => {
  it('pushes off and clicks on request', () => {
    sounds.jump();
    sounds.flashlight();
    expect(played('jump')).toBe(1);
    expect(played('flashlight')).toBe(1);
  });

  it('slams into an obstacle on request', () => {
    sounds.impact();
    expect(played('land-hard')).toBe(1);
  });

  it('lands with a footstep as the feet touch down', () => {
    fall();
    sounds.state.onGround = true;
    sounds.state.grounded = true;
    sounds.state.fallSpeed = 10.5;
    sounds.update(frame);
    expect(played('land')).toBe(1);
    expect(played('step-dirt')).toBe(1);
  });

  it('lands hard when the fall hurt', () => {
    fall();
    sounds.state.onGround = true;
    sounds.state.fallSpeed = 18;
    sounds.state.hurt = true;
    sounds.update(frame);
    expect(played('land-hard')).toBe(1);
  });

  it('plays no landing while standing, or touching down in water', () => {
    stand();
    stand();
    fall();
    sounds.state.onGround = true;
    sounds.state.fallSpeed = 10.5;
    sounds.state.immersion = 0.5;
    sounds.update(frame);
    expect(played('land')).toBe(0);
  });

  it('steps while walking, but not while sliding', () => {
    const s = sounds.state;
    stand();
    s.moved = 6 * frame;
    for (let i = 0; i < 120; i++) sounds.update(frame);
    const walking = played('step-dirt');
    expect(walking).toBeGreaterThan(0);

    s.slideX = SLIDING_FROM + 1;
    for (let i = 0; i < 120; i++) sounds.update(frame);
    expect(played('step-dirt')).toBe(walking);
  });

  it('owns the footsteps for the console until disposed', () => {
    expect(Footsteps.current).not.toBeNull();
    sounds.dispose();
    expect(Footsteps.current).toBeNull();
  });

  it('logs a bad footsteps table and carries on without steps', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const bad = new PlayerSounds(engine, engine.createScope(), {
      ...FOOTSTEPS,
      fallback: 'mud',
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    bad.state.onGround = true;
    bad.state.grounded = true;
    bad.state.moved = 1;
    for (let i = 0; i < 60; i++) bad.update(frame);
    expect(played('step-dirt')).toBe(0);
    bad.dispose();
  });

  it('breathes from the stamina spent, with a voice table', () => {
    const voiced = new PlayerSounds(
      engine,
      engine.createScope(),
      FOOTSTEPS,
      VOICE
    );
    const voice = VoiceSound.current!;
    expect(voice).not.toBeNull();
    const s = voiced.state;
    s.stamina = 0.1;
    for (let i = 0; i < 180; i++) voiced.update(frame);
    expect(voice.effort).toBeGreaterThan(0.7);

    s.stamina = 1;
    for (let i = 0; i < 600; i++) voiced.update(frame);
    expect(voice.effort).toBeLessThan(0.2);
    voiced.dispose();
    expect(VoiceSound.current).toBeNull();
  });

  it('logs a bad voice table and carries on without a voice', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const bad = new PlayerSounds(engine, engine.createScope(), FOOTSTEPS, {
      layers: [],
      every: { calm: [1, 2] },
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect(VoiceSound.current).toBeNull();
    bad.update(frame);
    bad.dispose();
  });

  it('pulls the world away at low health', () => {
    sounds.state.health = 5;
    sounds.update(frame);
    expect(engine.muffleLevel).toBeCloseTo(DAZED_LEVEL, 6);
    sounds.state.health = 100;
    sounds.update(frame);
    expect(engine.muffleLevel).toBe(1);
  });

  it('breathes with the strokes while swimming at the surface', () => {
    const voiced = new PlayerSounds(
      engine,
      engine.createScope(),
      FOOTSTEPS,
      VOICE
    );
    const s = voiced.state;
    s.swimming = true;
    s.immersion = 2;
    s.pushing = true;
    for (let i = 0; i < 300; i++) voiced.update(frame);
    expect(played('swim-stroke')).toBeGreaterThan(3);
    expect(played('breath-swim')).toBe(played('swim-stroke'));
    voiced.dispose();
  });

  it('fades out the breathing and the body loops on death', () => {
    const before = new Set(engine.beds);
    const voiced = new PlayerSounds(
      engine,
      engine.createScope(),
      FOOTSTEPS,
      VOICE
    );
    const own = () => [...engine.beds].filter((bed) => !before.has(bed));
    expect(own().length).toBeGreaterThan(1);
    voiced.die();
    expect(own().map((bed) => bed.spec.sounds[0])).toEqual(['under-water']);
    expect(own()[0].gain).toBe(0);
    voiced.dispose();
  });

  it('dies with a death sound, and the world goes distant and dull', () => {
    sounds.die();
    expect(played('death')).toBe(1);
    expect(deathStart()).toBeCloseTo(now(), 6);
    expect(engine.muffleCutoff).toBe(DEAD_CUTOFF);
    expect(engine.muffleLevel).toBe(DEAD_LEVEL);
    sounds.dispose();
    expect(engine.muffleLevel).toBe(1);
  });

  it('dies after the thud of a fall that kills', () => {
    fall();
    sounds.state.onGround = true;
    sounds.state.fallSpeed = 30;
    sounds.state.hurt = true;
    sounds.update(frame);
    sounds.die();
    expect(played('land-hard')).toBe(1);
    expect(deathStart()).toBeCloseTo(now() + DEATH_AFTER_THUD, 6);
  });

  it('dies after the thud of an impact that kills', () => {
    sounds.impact();
    sounds.update(frame);
    sounds.die();
    expect(deathStart()).toBeCloseTo(now() + DEATH_AFTER_THUD, 6);
  });
});
