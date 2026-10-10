import { Vector3 } from 'rewild-common';
import { AudioEngine } from 'rewild-audio';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakePannerNode,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import type { WindState } from 'rewild-renderer/lib/renderers/sky/WindState';
import { WindSound } from './WindSound';
import { airBlend } from './windMapping';

/** The gust share at the listener, 0..1, set by each test. */
let field = 0;
const LULL = 0;
const GUST = 1;

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'wind-0': 1000,
  'wind-1': 1001,
  'wind-2': 1002,
  'wind-ears': 2000,
  'wind-gust': 3000,
};

const manifest = {
  sounds: Object.keys(LENGTHS).map((name) => ({
    name,
    files: [name],
    loop: name !== 'wind-gust',
    source: 'test',
    license: 'own',
  })),
};

let restore: () => void;
let engine: AudioEngine;
let wind: WindSound;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sourcesOf(name: string): FakeAudioBufferSourceNode[] {
  return ctx().sources.filter((s) => s.buffer?.length === LENGTHS[name]);
}

/** Air moving toward +x at `windiness`: it comes from -x. */
function windState(windiness: number): WindState {
  return {
    vec: new Float32Array([1, 0, windiness, 0]),
    gustDrift: new Float32Array(2),
  } as unknown as WindState;
}

function face(x: number, z: number) {
  engine.setListener(
    new Vector3(0, 0, 0),
    new Vector3(x, 0, z),
    new Vector3(0, 1, 0)
  );
}

function step(state: WindState, seconds = 0.1) {
  wind.update(state, seconds);
  engine.update();
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  field = LULL;
  engine = new AudioEngine(
    undefined,
    async (url) => new ArrayBuffer(LENGTHS[url])
  );
  engine.bank.random = () => 0.5;
  await engine.start();
  await engine.loadSounds(manifest);
  face(-1, 0);
  wind = new WindSound(engine, engine.createScope(), () => field);
});

afterEach(() => {
  restore();
});

describe('WindSound', () => {
  it('plays the calm loop softly and dull in light wind', () => {
    step(windState(0.1));
    const layers = ['wind-0', 'wind-1', 'wind-2'].map(
      (name) => sourcesOf(name)[0]
    );
    expect(layers.every(Boolean)).toBe(true);

    const calmWeight = layers[0].outputs[0] as FakeGainNode;
    expect(calmWeight.gain.value).toBe(1);
    const out = calmWeight.outputs[0] as FakeGainNode;
    expect(out.gain.lastTarget!.value).toBeLessThan(0.4);
    const filter = out.outputs[0] as FakeBiquadFilterNode;
    expect(filter.frequency.lastTarget!.value).toBeLessThan(3000);
    expect(filter.outputs).toEqual([engine.bus('weather')]);
  });

  it('crossfades towards the windy loop as the wind rises', () => {
    step(windState(0.1));
    step(windState(0.8));
    const windy = sourcesOf('wind-2')[0].outputs[0] as FakeGainNode;
    const calm = sourcesOf('wind-0')[0].outputs[0] as FakeGainNode;
    expect(airBlend(0.8)).toBe(2);
    expect(windy.gain.lastTarget!.value).toBeCloseTo(1, 6);
    expect(calm.gain.lastTarget!.value).toBeCloseTo(0, 6);
  });

  it('has no roar in the ears below a gale', () => {
    step(windState(0.6));
    expect(sourcesOf('wind-ears')).toHaveLength(0);
  });

  it('roars from upwind when facing into a gale', () => {
    field = GUST;
    step(windState(1));
    const ears = sourcesOf('wind-ears');
    expect(ears).toHaveLength(1);
    const panner = ears[0].outputs[0].outputs[0].outputs[0] as FakePannerNode;
    expect(panner.positionX.value).toBeCloseTo(-10, 6);
    expect(panner.positionZ.value).toBeCloseTo(0, 6);
    expect(panner.rolloffFactor).toBe(0);
    expect(panner.panningModel).toBe('equalpower');
  });

  it('drops the roar with your back to the gale', () => {
    field = GUST;
    face(1, 0);
    step(windState(1));
    expect(sourcesOf('wind-ears')).toHaveLength(0);
  });

  it('plays a gust from upwind as one surges past', () => {
    step(windState(0.6));
    field = GUST;
    step(windState(0.6));
    const gusts = sourcesOf('wind-gust');
    expect(gusts).toHaveLength(1);
    const panner = gusts[0].outputs[0].outputs[0].outputs[0] as FakePannerNode;
    expect(panner.positionX.value).toBeCloseTo(-15, 6);
    expect(panner.outputs).toEqual([engine.bus('weather')]);
  });

  it('plays one gust per surge', () => {
    field = GUST;
    for (let i = 0; i < 50; i++) step(windState(0.6));
    expect(sourcesOf('wind-gust')).toHaveLength(1);
  });

  it('waits a few seconds between gusts', () => {
    field = GUST;
    step(windState(0.6));
    field = LULL;
    step(windState(0.6), 1);
    field = GUST;
    step(windState(0.6), 1);
    expect(sourcesOf('wind-gust')).toHaveLength(1);

    field = LULL;
    step(windState(0.6), 1);
    field = GUST;
    step(windState(0.6), 1);
    expect(sourcesOf('wind-gust')).toHaveLength(2);
  });

  it('plays no gusts in light wind', () => {
    step(windState(0.2));
    field = GUST;
    step(windState(0.2));
    expect(sourcesOf('wind-gust')).toHaveLength(0);
  });

  it('follows the gust with an envelope that rises fast and falls slow', () => {
    field = GUST;
    step(windState(1), 0.25);
    const risen = wind.envelope;
    expect(risen).toBeGreaterThan(0.5);
    field = LULL;
    step(windState(1), 0.25);
    expect(wind.envelope).toBeGreaterThan(risen * 0.8);
  });
});
