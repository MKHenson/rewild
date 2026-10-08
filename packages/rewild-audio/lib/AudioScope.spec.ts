import { Vector3 } from 'rewild-common';
import { AudioEngine } from './AudioEngine';
import { SCOPE_FADE } from './AudioScope';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeGainNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

const manifest = {
  sounds: ['blip', 'loop'].map((name) => ({
    name,
    files: [`${name}.ogg`],
    source: 'test',
    license: 'own',
  })),
};

let restore: () => void;
let engine: AudioEngine;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function lastSource(): FakeAudioBufferSourceNode {
  const all = ctx().sources;
  return all[all.length - 1];
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  engine = new AudioEngine(undefined, async () => new ArrayBuffer(48000));
  await engine.start();
  await engine.loadSounds(manifest);
  ctx().currentTime = 10;
});

afterEach(() => {
  jest.useRealTimers();
  restore();
});

describe('AudioScope', () => {
  it('fades out its 2D one-shots on dispose', () => {
    const scope = engine.createScope();
    scope.play('blip');
    const source = lastSource();
    const amp = source.outputs[0] as FakeGainNode;
    expect(engine.oneShotsPlaying).toBe(1);

    scope.dispose();
    expect(amp.gain.lastTarget!.value).toBe(0);
    expect(source.stoppedAt).toBeCloseTo(10 + SCOPE_FADE, 10);
  });

  it('forgets a one-shot once it ends', () => {
    engine.createScope().play('blip');
    lastSource().end();
    expect(engine.oneShotsPlaying).toBe(0);
  });

  it('fades out its 3D sounds and loops on dispose', () => {
    const scope = engine.createScope();
    scope.play('blip', { at: new Vector3(5, 0, 0) });
    const shot = lastSource();
    const id = scope.loop('loop', { at: new Vector3(5, 0, 0) });
    const loop = lastSource();

    scope.dispose(0.5);
    expect(shot.stoppedAt).toBeCloseTo(10.5, 10);
    expect(loop.stoppedAt).toBeCloseTo(10.5, 10);

    loop.end();
    expect(engine.isPlaying(id)).toBe(false);
  });

  it('leaves sounds outside it playing', () => {
    const scope = engine.createScope();
    const other = engine.createScope();
    engine.play('blip');
    const free = lastSource();
    other.play('blip', { at: new Vector3(1, 0, 0) });
    const others = lastSource();
    scope.play('blip');

    scope.dispose();
    expect(free.stopped).toBe(false);
    expect(others.stopped).toBe(false);
  });

  it('fades out its beds, then disconnects them', () => {
    const scope = engine.createScope();
    const bed = scope.createBed({
      sounds: ['loop'],
      bus: 'ambience',
      attack: 1,
      release: 1,
    });
    bed.set(1);
    const source = lastSource();
    const out = (source.outputs[0] as FakeGainNode).outputs[0] as FakeGainNode;

    scope.dispose(0.6);
    expect(bed.disposed).toBe(true);
    expect(bed.state).toBe('stopped');
    expect(out.gain.lastTarget!.value).toBe(0);
    expect(source.stoppedAt).toBeCloseTo(10.6, 10);
    expect(out.outputs).toHaveLength(1);
    expect(engine.beds.has(bed)).toBe(false);

    jest.advanceTimersByTime(600);
    expect(out.outputs).toHaveLength(0);
  });

  it('ignores a disposed bed', () => {
    const bed = engine.createBed({
      sounds: ['loop'],
      bus: 'ambience',
      attack: 1,
      release: 1,
    });
    bed.dispose();
    bed.set(1);
    expect(ctx().sources).toHaveLength(0);
  });

  it('stops its emitters on dispose', () => {
    const scope = engine.createScope();
    const emitter = scope.createEmitter({
      sound: 'loop',
      at: new Vector3(10, 0, 0),
    });
    engine.update();
    const source = lastSource();

    scope.dispose();
    expect(emitter.disposed).toBe(true);
    expect(source.stoppedAt).toBeCloseTo(10 + SCOPE_FADE, 10);
    expect(engine.emitters).not.toContain(emitter);
  });

  it('plays nothing once disposed', () => {
    const scope = engine.createScope();
    scope.dispose();
    expect(scope.play('blip')).toBe(false);
    expect(scope.loop('loop', { at: new Vector3(1, 0, 0) })).toBe(0);
    expect(
      scope.createBed({
        sounds: ['loop'],
        bus: 'ambience',
        attack: 1,
        release: 1,
      }).disposed
    ).toBe(true);
    expect(
      scope.createEmitter({ sound: 'loop', at: new Vector3(1, 0, 0) }).disposed
    ).toBe(true);
    expect(ctx().sources).toHaveLength(0);
  });

  it('gives each scope its own id', () => {
    expect(engine.createScope().id).not.toBe(engine.createScope().id);
  });
});

describe('AudioEngine.suspendWhenHidden', () => {
  function fakeDocument() {
    const doc = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    doc.visibilityState = 'visible';
    return doc;
  }

  const flush = () => Promise.resolve();

  it('suspends while hidden and resumes when shown', async () => {
    const doc = fakeDocument();
    engine.suspendWhenHidden(doc as unknown as Document);

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(engine.state).toBe('suspended');

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(engine.state).toBe('running');
  });

  it('keeps playing while hidden when its condition says no', async () => {
    const doc = fakeDocument();
    let allow = false;
    engine.suspendWhenHidden(doc as unknown as Document, () => allow);

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(engine.state).toBe('running');

    allow = true;
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(engine.state).toBe('suspended');
  });

  it('stops listening when its cleanup is called', async () => {
    const doc = fakeDocument();
    const cleanup = engine.suspendWhenHidden(doc as unknown as Document);
    cleanup();

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(engine.state).toBe('running');
  });
});
