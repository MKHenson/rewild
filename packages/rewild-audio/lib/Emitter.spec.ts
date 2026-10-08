import { Vector3 } from 'rewild-common';
import { AudioEngine } from './AudioEngine';
import { EMITTER_FADE, Emitter, EmitterSpec } from './Emitter';
import { VOICE_COUNT } from './VoicePool';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeGainNode,
  FakePannerNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

// With the inverse curve and a 2 m reference, a gain-1 sound is heard at 2 / d:
// it takes a voice inside 200 m and gives it back beyond 400 m.
const NEAR = 100;
const EDGE = 300;
const FAR = 500;

function sound(name: string) {
  return { name, files: [`${name}.ogg`], source: 'test', license: 'own' };
}

const manifest = { sounds: [sound('waterfall'), sound('blip')] };

let restore: () => void;
let engine: AudioEngine;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function emitter(extra: Partial<EmitterSpec> = {}): Emitter {
  return engine.createEmitter({
    sound: 'waterfall',
    at: new Vector3(NEAR, 0, 0),
    ...extra,
  });
}

function lastSource(): FakeAudioBufferSourceNode {
  const all = ctx().sources;
  return all[all.length - 1];
}

function gainOf(source: FakeAudioBufferSourceNode): FakeGainNode {
  return source.outputs[0].outputs[0] as FakeGainNode;
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  engine = new AudioEngine(undefined, async (url) => {
    // A 2 s waterfall and a 1 s blip, so tests can tell their sources apart.
    return new ArrayBuffer(url.startsWith('waterfall') ? 96000 : 48000);
  });
  await engine.start();
  await engine.loadSounds(manifest);
});

afterEach(() => {
  jest.restoreAllMocks();
  restore();
});

describe('Emitter', () => {
  it('starts virtual and takes a voice on update when it can be heard', () => {
    const e = emitter();
    expect(e.state).toBe('virtual');
    expect(engine.voicesInUse).toBe(0);

    engine.update();
    expect(e.state).toBe('playing');
    expect(engine.voicesInUse).toBe(1);
    expect(lastSource().loop).toBe(true);
  });

  it('starts at a random point in the loop and fades in', () => {
    ctx().currentTime = 4;
    emitter({ gain: 0.8 });
    engine.update();
    const source = lastSource();
    expect(source.offset).toBeCloseTo(1, 6);
    const gain = gainOf(source).gain;
    expect(gain.value).toBe(0);
    expect(gain.lastTarget!.value).toBeCloseTo(0.8, 10);
    expect(gain.lastTarget!.time).toBe(4);
    expect(gain.lastTarget!.timeConstant).toBeCloseTo(EMITTER_FADE / 3, 10);
  });

  it('plays on the ambience bus unless told otherwise', () => {
    emitter();
    engine.update();
    const panner = gainOf(lastSource()).outputs[0] as FakePannerNode;
    expect(panner.outputs).toEqual([engine.bus('ambience')]);
  });

  it('stays virtual out of earshot', () => {
    const e = emitter({ at: new Vector3(FAR, 0, 0) });
    engine.update();
    expect(e.state).toBe('virtual');
    expect(ctx().sources).toHaveLength(0);
  });

  it('stays virtual before the engine starts, then plays once it does', async () => {
    const idle = new AudioEngine(undefined, async () => new ArrayBuffer(48000));
    idle.loadSounds(manifest);
    const e = idle.createEmitter({
      sound: 'waterfall',
      at: new Vector3(NEAR, 0, 0),
    });
    idle.update();
    expect(e.state).toBe('virtual');

    await idle.start();
    await idle.bank.decode(idle.context!);
    idle.update();
    expect(e.state).toBe('playing');
  });

  it('keeps its voice at the edge of earshot', () => {
    const e = emitter();
    engine.update();
    e.move(new Vector3(EDGE, 0, 0));
    engine.update();
    expect(e.state).toBe('playing');
  });

  it('fades out and gives its voice back when the listener walks away', () => {
    ctx().currentTime = 2;
    const e = emitter();
    engine.update();
    const source = lastSource();

    engine.setListener(
      new Vector3(-FAR, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    engine.update();
    expect(e.state).toBe('virtual');
    expect(gainOf(source).gain.lastTarget!.value).toBe(0);
    expect(source.stoppedAt).toBeCloseTo(2 + EMITTER_FADE, 10);

    source.end();
    expect(engine.voicesInUse).toBe(0);
  });

  it('comes back when the listener returns', () => {
    const e = emitter();
    engine.update();
    engine.setListener(
      new Vector3(-FAR, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    engine.update();
    lastSource().end();

    engine.setListener(
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    engine.update();
    expect(e.state).toBe('playing');
    expect(ctx().sources).toHaveLength(2);
  });

  it('goes virtual when a louder sound takes its voice, and comes back after', () => {
    const e = emitter();
    engine.update();
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(1, 0, 0) });

    engine.update();
    expect(e.state).toBe('virtual');

    for (const source of ctx().sources.slice(1)) source.end();
    engine.update();
    expect(e.state).toBe('playing');
  });

  it('is stolen last when it has a high priority', () => {
    const e = emitter({ priority: 100 });
    engine.update();
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(1, 0, 0), gain: 0.5 });
    engine.update();
    expect(e.state).toBe('playing');
  });

  it('moves its voice while playing', () => {
    const e = emitter();
    engine.update();
    const panner = gainOf(lastSource()).outputs[0] as FakePannerNode;
    e.move(new Vector3(NEAR, 5, -3));
    expect(panner.positionY.lastTarget!.value).toBe(5);
    expect(panner.positionZ.lastTarget!.value).toBe(-3);
    expect([e.at.x, e.at.y, e.at.z]).toEqual([NEAR, 5, -3]);
  });

  it('moves its gain and cutoff while playing', () => {
    const e = emitter({ cutoff: 8000 });
    engine.update();
    const source = lastSource();
    e.set(0.4, 1200);
    expect(gainOf(source).gain.lastTarget!.value).toBeCloseTo(0.4, 10);
    const filter = source.outputs[0] as any;
    expect(filter.frequency.lastTarget.value).toBe(1200);
  });

  it('goes virtual when its gain is set to 0', () => {
    const e = emitter();
    engine.update();
    e.set(0);
    engine.update();
    expect(e.state).toBe('virtual');
  });

  it('plays at any distance with no rolloff', () => {
    const e = emitter({ at: new Vector3(5000, 0, 0), rolloff: 0 });
    engine.update();
    expect(e.state).toBe('playing');
  });

  it('waits for its sound to load', async () => {
    const e = engine.createEmitter({
      sound: 'late',
      at: new Vector3(NEAR, 0, 0),
    });
    engine.update();
    expect(e.state).toBe('virtual');

    await engine.loadSounds({ sounds: [...manifest.sounds, sound('late')] });
    engine.update();
    expect(e.state).toBe('playing');
  });

  it('takes a voice on the new context after the engine restarts', async () => {
    const e = emitter();
    engine.update();
    await engine.close();
    engine.update();
    expect(e.state).toBe('virtual');

    await engine.start();
    engine.update();
    expect(e.state).toBe('playing');
    expect(ctx().sources).toHaveLength(1);
  });

  it('stops and leaves the engine on dispose', () => {
    const e = emitter();
    engine.update();
    const source = lastSource();
    e.dispose();
    expect(source.stopped).toBe(true);
    expect(engine.emitters).not.toContain(e);
    engine.update();
    expect(ctx().sources).toHaveLength(1);
  });
});
