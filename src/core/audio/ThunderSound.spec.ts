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
import { StrikeQueue } from 'rewild-renderer/lib/renderers/sky/StrikeQueue';
import type { WindState } from 'rewild-renderer/lib/renderers/sky/WindState';
import { SPEED_OF_SOUND, THUNDER_DUCK_DB } from './thunderMapping';
import { ThunderSound } from './ThunderSound';

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'thunder-close': 1000,
  'thunder-far': 2000,
  'thunder-chain': 3000,
};

const manifest = {
  sounds: Object.keys(LENGTHS).map((name) => ({
    name,
    files: [name],
    source: 'test',
    license: 'own',
  })),
};

/** Air moving toward +x: the wind comes from -x. */
const wind = {
  vec: new Float32Array([1, 0, 0.5, 0]),
  gustDrift: new Float32Array(2),
} as unknown as WindState;

let restore: () => void;
let engine: AudioEngine;
let thunder: ThunderSound;
let strikes: StrikeQueue;
let clock = 0;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sourcesOf(name: string): FakeAudioBufferSourceNode[] {
  return ctx().sources.filter((s) => s.buffer?.length === LENGTHS[name]);
}

function filterOf(source: FakeAudioBufferSourceNode): FakeBiquadFilterNode {
  return source.outputs[0] as FakeBiquadFilterNode;
}

function pannerOf(source: FakeAudioBufferSourceNode): FakePannerNode {
  return source.outputs[0].outputs[0].outputs[0] as FakePannerNode;
}

function step(stormComing = false, seconds = 0.1) {
  thunder.update(strikes, wind, stormComing, seconds);
  engine.update();
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
  engine.setListener(
    new Vector3(0, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
  clock = 0;
  strikes = new StrikeQueue(8, () => clock);
  thunder = new ThunderSound(engine, engine.createScope(), () => 0);
});

afterEach(() => {
  restore();
});

describe('ThunderSound', () => {
  it('plays a near strike late by its distance, from its direction', () => {
    strikes.push(800, 520, 0, 0);
    step();
    const [close] = sourcesOf('thunder-close');
    expect(close).toBeDefined();
    expect(close.startedAt).toBeCloseTo(800 / SPEED_OF_SOUND, 6);
    const panner = pannerOf(close);
    expect(panner.positionX.value).toBeCloseTo(50, 6);
    expect(panner.positionZ.value).toBeCloseTo(0, 6);
    expect(panner.rolloffFactor).toBe(0);
    expect(panner.outputs).toEqual([engine.bus('effects')]);
  });

  it('plays a far strike as a deeper rumble', () => {
    strikes.push(800, 520, 0, 0);
    strikes.push(0, 520, 1800, 0);
    step();
    const [far] = sourcesOf('thunder-far');
    const [close] = sourcesOf('thunder-close');
    expect(far).toBeDefined();
    expect(filterOf(far).frequency.value).toBeLessThan(
      filterOf(close).frequency.value
    );
  });

  it('counts the delay from the strike, not from when it is read', () => {
    strikes.push(686, 520, 0, 0);
    clock = 0.5;
    step();
    expect(sourcesOf('thunder-close')[0].startedAt).toBeCloseTo(1.5, 6);
  });

  it('plays a short crack for a chained strike', () => {
    strikes.push(900, 520, 0, 0);
    strikes.push(900, 520, 0, 1);
    step();
    expect(sourcesOf('thunder-close')).toHaveLength(1);
    expect(sourcesOf('thunder-chain')).toHaveLength(1);
  });

  it('plays a chained crack as loud as the thunder before it', () => {
    strikes.push(900, 520, 0, 0);
    strikes.push(900, 520, 0, 1);
    step();
    const [close] = sourcesOf('thunder-close');
    const [chain] = sourcesOf('thunder-chain');
    const level = (s: FakeAudioBufferSourceNode) =>
      (s.outputs[0].outputs[0] as FakeGainNode).gain.value;
    expect(level(chain)).toBeCloseTo(level(close), 6);
  });

  it('ducks the rain, the wind and the land as the thunder arrives', () => {
    strikes.push(700, 520, 0, 0);
    step();
    expect(engine.busDuck('weather')).toBe(1);

    clock = 700 / SPEED_OF_SOUND + 0.01;
    step();
    const full = Math.pow(10, THUNDER_DUCK_DB / 20);
    expect(engine.busDuck('weather')).toBeCloseTo(full, 6);
    expect(engine.busDuck('ambience')).toBeCloseTo(full, 6);
    expect(engine.busDuck('effects')).toBe(1);

    clock += 30;
    step();
    expect(engine.busDuck('weather')).toBe(1);
  });

  it('ducks less under far thunder', () => {
    strikes.push(1900, 520, 0, 0);
    clock = 1900 / SPEED_OF_SOUND + 0.01;
    step();
    const duck = engine.busDuck('weather');
    expect(duck).toBeLessThan(1);
    expect(duck).toBeGreaterThan(Math.pow(10, THUNDER_DUCK_DB / 20));
  });

  it('drops strikes whose thunder has long passed', () => {
    strikes.push(700, 520, 0, 0);
    clock = 10;
    step();
    expect(ctx().sources).toHaveLength(0);
    expect(strikes.size).toBe(0);
  });

  it('rumbles from upwind while a storm is coming', () => {
    step(true, 0.1);
    expect(sourcesOf('thunder-far')).toHaveLength(0);
    step(true, 30);
    const [rumble] = sourcesOf('thunder-far');
    expect(rumble).toBeDefined();
    expect(pannerOf(rumble).positionX.value).toBeCloseTo(-50, 6);
    expect(filterOf(rumble).frequency.value).toBeLessThan(1000);
  });

  it('does not rumble in other weather', () => {
    step(false, 100);
    expect(ctx().sources).toHaveLength(0);
  });
});
