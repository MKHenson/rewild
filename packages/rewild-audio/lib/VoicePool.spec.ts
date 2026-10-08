import { Matrix4, Vector3 } from 'rewild-common';
import { AudioEngine } from './AudioEngine';
import { REF_DISTANCE, VOICE_COUNT, inverseDistanceGain } from './VoicePool';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakePannerNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

const manifest = {
  sounds: [
    { name: 'blip', files: ['blip.ogg'], source: 'test', license: 'own' },
  ],
};

let restore: () => void;
let engine: AudioEngine;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function lastSource(): FakeAudioBufferSourceNode {
  const sources = ctx().sources;
  return sources[sources.length - 1];
}

/** The filter, gain and panner a source plays through. */
function chain(source: FakeAudioBufferSourceNode) {
  const filter = source.outputs[0] as FakeBiquadFilterNode;
  const gain = filter.outputs[0] as FakeGainNode;
  const panner = gain.outputs[0] as FakePannerNode;
  return { filter, gain, panner };
}

function distances(): number[] {
  return engine
    .voices()
    .map((v) => Math.round(v.at.length()))
    .sort((a, b) => a - b);
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  engine = new AudioEngine(undefined, async () => new ArrayBuffer(48000));
  await engine.start();
  await engine.loadSounds(manifest);
});

afterEach(() => {
  restore();
});

describe('inverseDistanceGain', () => {
  it('is full inside the reference distance', () => {
    expect(inverseDistanceGain(0, 2, 1)).toBe(1);
    expect(inverseDistanceGain(2, 2, 1)).toBe(1);
  });

  it('halves at twice the reference distance', () => {
    expect(inverseDistanceGain(4, 2, 1)).toBeCloseTo(0.5, 10);
  });

  it('does not fade with no rolloff', () => {
    expect(inverseDistanceGain(1000, 2, 0)).toBe(1);
  });
});

describe('3D voices', () => {
  it('builds a pool of HRTF panners with the inverse distance model', () => {
    expect(engine.voiceCount).toBe(VOICE_COUNT);
    expect(ctx().panners).toHaveLength(VOICE_COUNT);
    for (const panner of ctx().panners) {
      expect(panner.panningModel).toBe('HRTF');
      expect(panner.distanceModel).toBe('inverse');
      expect(panner.refDistance).toBe(REF_DISTANCE);
    }
  });

  it('cannot play in 3D before the engine starts', () => {
    const idle = new AudioEngine(undefined, async () => new ArrayBuffer(8));
    expect(idle.play('blip', { at: new Vector3(1, 0, 0) })).toBe(false);
    expect(idle.loop('blip', { at: new Vector3(1, 0, 0) })).toBe(0);
  });

  it('plays through a filter, gain and panner into the bus', () => {
    expect(
      engine.play('blip', {
        at: new Vector3(-20, 1, 3),
        gain: 0.5,
        cutoff: 900,
        bus: 'weather',
      })
    ).toBe(true);
    const { filter, gain, panner } = chain(lastSource());
    expect(filter.frequency.value).toBe(900);
    expect(gain.gain.value).toBe(0.5);
    expect([
      panner.positionX.value,
      panner.positionY.value,
      panner.positionZ.value,
    ]).toEqual([-20, 1, 3]);
    expect(panner.outputs).toEqual([engine.bus('weather')]);
  });

  it('opens the filter when no cutoff is given', () => {
    engine.play('blip', { at: new Vector3(1, 0, 0), cutoff: 500 });
    lastSource().end();
    engine.play('blip', { at: new Vector3(1, 0, 0) });
    expect(chain(lastSource()).filter.frequency.value).toBe(20000);
  });

  it('delays on the audio clock', () => {
    ctx().currentTime = 10;
    engine.play('blip', { at: new Vector3(5, 0, 0), delay: 3.2 });
    expect(lastSource().startedAt).toBeCloseTo(13.2, 10);
  });

  it('delays 2D sounds on the audio clock too', () => {
    ctx().currentTime = 4;
    engine.play('blip', { delay: 1 });
    expect(lastSource().startedAt).toBe(5);
  });

  it('frees a voice when its sound ends', () => {
    engine.play('blip', { at: new Vector3(1, 0, 0) });
    engine.play('blip', { at: new Vector3(2, 0, 0) });
    expect(engine.voicesInUse).toBe(2);
    ctx().sources[0].end();
    expect(engine.voicesInUse).toBe(1);
  });

  it('reconnects a reused voice to a new bus', () => {
    engine.play('blip', { at: new Vector3(1, 0, 0), bus: 'weather' });
    const first = chain(lastSource()).panner;
    lastSource().end();
    engine.play('blip', { at: new Vector3(1, 0, 0), bus: 'ui' });
    const { panner } = chain(lastSource());
    expect(panner).toBe(first);
    expect(panner.outputs).toEqual([engine.bus('ui')]);
  });

  it('keeps the nearest sounds when far ones arrive first', () => {
    for (let d = 40; d >= 1; d--)
      engine.play('blip', { at: new Vector3(d * 3, 0, 0) });
    expect(engine.voicesInUse).toBe(VOICE_COUNT);
    expect(distances()).toEqual(
      Array.from({ length: VOICE_COUNT }, (_, i) => (i + 1) * 3)
    );
  });

  it('drops a new sound quieter than every voice', () => {
    const played: boolean[] = [];
    for (let d = 1; d <= 40; d++)
      played.push(engine.play('blip', { at: new Vector3(d * 3, 0, 0) }));
    expect(played.filter(Boolean)).toHaveLength(VOICE_COUNT);
    expect(played.slice(VOICE_COUNT).some(Boolean)).toBe(false);
    expect(distances()[VOICE_COUNT - 1]).toBe(VOICE_COUNT * 3);
  });

  it('ranks by gain as well as distance', () => {
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(10, 0, 0), gain: 0.5 });
    expect(engine.play('blip', { at: new Vector3(10, 0, 0), gain: 0.4 })).toBe(
      false
    );
    expect(engine.play('blip', { at: new Vector3(10, 0, 0), gain: 0.6 })).toBe(
      true
    );
  });

  it('ranks by distance from the listener', () => {
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(100, 0, 0) });
    expect(engine.play('blip', { at: new Vector3(-100, 0, 0) })).toBe(false);
    engine.setListener(
      new Vector3(-100, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    expect(engine.play('blip', { at: new Vector3(-100, 0, 0) })).toBe(true);
  });

  it('ignores distance for a sound with no rolloff', () => {
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(5, 0, 0), gain: 0.1 });
    expect(
      engine.play('blip', {
        at: new Vector3(2000, 0, 0),
        gain: 0.5,
        rolloff: 0,
      })
    ).toBe(true);
    expect(chain(lastSource()).panner.rolloffFactor).toBe(0);
  });

  it('stops the stolen sound and ignores its end', () => {
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(50, 0, 0) });
    const stolen = ctx().sources[0];
    engine.play('blip', { at: new Vector3(1, 0, 0) });
    expect(stolen.stopped).toBe(true);
    expect(stolen.outputs).toHaveLength(0);

    stolen.end();
    expect(engine.voicesInUse).toBe(VOICE_COUNT);
  });
});

describe('3D loops', () => {
  it('loops until stopped', () => {
    const id = engine.loop('blip', { at: new Vector3(3, 0, 0) });
    expect(id).toBeGreaterThan(0);
    expect(lastSource().loop).toBe(true);
    expect(engine.isPlaying(id)).toBe(true);
  });

  it('glides when moved', () => {
    ctx().currentTime = 2;
    const id = engine.loop('blip', { at: new Vector3(3, 0, 0) });
    const { panner } = chain(lastSource());
    expect(engine.move(id, new Vector3(7, 1, -2))).toBe(true);
    expect(panner.positionX.value).toBe(3);
    expect(panner.positionX.lastTarget).toEqual(
      expect.objectContaining({ value: 7, time: 2 })
    );
    expect(panner.positionZ.lastTarget!.value).toBe(-2);
  });

  it('fades out on stop and frees the voice when it ends', () => {
    ctx().currentTime = 1;
    const id = engine.loop('blip', { at: new Vector3(3, 0, 0) });
    const source = lastSource();
    const { gain } = chain(source);

    expect(engine.stop(id, 0.6)).toBe(true);
    expect(gain.gain.lastTarget).toEqual(
      expect.objectContaining({ value: 0, time: 1 })
    );
    expect(gain.gain.lastTarget!.timeConstant).toBeCloseTo(0.2, 10);
    expect(source.stoppedAt).toBeCloseTo(1.6, 10);

    source.end();
    expect(engine.isPlaying(id)).toBe(false);
    expect(engine.move(id, new Vector3(0, 0, 0))).toBe(false);
    expect(engine.stop(id)).toBe(false);
  });

  it('gives a stopping loop up first when voices run out', () => {
    const id = engine.loop('blip', { at: new Vector3(1, 0, 0) });
    for (let i = 1; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(50, 0, 0) });
    engine.stop(id, 1);
    expect(engine.play('blip', { at: new Vector3(60, 0, 0) })).toBe(true);
    expect(engine.isPlaying(id)).toBe(false);
  });

  it('loses its id once its voice is stolen', () => {
    const id = engine.loop('blip', { at: new Vector3(80, 0, 0), gain: 0.1 });
    for (let i = 0; i < VOICE_COUNT; i++)
      engine.play('blip', { at: new Vector3(1, 0, 0) });
    expect(engine.isPlaying(id)).toBe(false);
    expect(engine.move(id, new Vector3(0, 0, 0))).toBe(false);
  });
});

describe('listener', () => {
  it('follows a column-major camera matrix', () => {
    ctx().currentTime = 3;
    // A camera at (1, 2, 3) turned to face +x: forward is the -z column, up is +y.
    const m = new Matrix4();
    m.elements.set([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 2, 3, 1]);
    engine.setListenerFromMatrix(m);

    const { listenerPosition: p, listenerForward: f, listenerUp: u } = engine;
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3]);
    expect(f.x).toBe(1);
    expect(Math.abs(f.y) + Math.abs(f.z)).toBe(0);
    expect([u.x, u.y, u.z]).toEqual([0, 1, 0]);
    const listener = ctx().listener;
    expect(listener.positionX.lastTarget).toEqual(
      expect.objectContaining({ value: 1, time: 3 })
    );
    expect(listener.forwardX.lastTarget!.value).toBe(1);
    expect(listener.upY.lastTarget!.value).toBe(1);
  });

  it('applies a listener set before the engine starts', async () => {
    const idle = new AudioEngine(undefined, async () => new ArrayBuffer(8));
    idle.setListener(
      new Vector3(4, 5, 6),
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0)
    );
    await idle.start();
    const listener = (idle.context as unknown as FakeAudioContext).listener;
    expect(listener.positionX.value).toBe(4);
    expect(listener.positionZ.value).toBe(6);
    expect(listener.forwardX.value).toBe(1);
    expect(listener.forwardZ.value).toBe(0);
  });

  it('builds a fresh pool after the engine restarts', async () => {
    engine.play('blip', { at: new Vector3(1, 0, 0) });
    await engine.close();
    expect(engine.voicesInUse).toBe(0);
    await engine.start();
    expect(engine.voiceCount).toBe(VOICE_COUNT);
    expect(engine.voicesInUse).toBe(0);
  });
});
