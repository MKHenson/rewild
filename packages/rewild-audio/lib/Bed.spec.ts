import { AudioEngine } from './AudioEngine';
import { BED_STOP_AFTER, Bed, BedSpec, layerWeights } from './Bed';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  installFakeAudioContext,
} from './testing/FakeAudioContext';

const SECOND = 48000;

function sound(name: string) {
  return { name, files: [`${name}.ogg`], source: 'test', license: 'own' };
}

const manifest = {
  sounds: [
    sound('rain-light'),
    sound('rain-heavy'),
    sound('wind'),
    { ...sound('breath'), gain: [0.5, 0.5] as [number, number] },
  ],
};

function spec(extra: Partial<BedSpec> = {}): BedSpec {
  return {
    sounds: ['wind'],
    bus: 'weather',
    attack: 1.5,
    release: 0.6,
    ...extra,
  };
}

let restore: () => void;
let engine: AudioEngine;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sources(): FakeAudioBufferSourceNode[] {
  return ctx().sources;
}

/** The bed's output gain: the node every layer gain feeds. */
function output(bed: Bed): FakeGainNode {
  return layerGain(0).outputs[0] as FakeGainNode;
}

function layerGain(index: number): FakeGainNode {
  return sources()[index].outputs[0] as FakeGainNode;
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  engine = new AudioEngine(undefined, async () => new ArrayBuffer(SECOND));
  await engine.start();
  await engine.loadSounds(manifest);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  restore();
});

describe('layerWeights', () => {
  const out = new Float32Array(3);

  it('gives a single layer full weight', () => {
    expect([...layerWeights(0.7, 1, out).slice(0, 1)]).toEqual([1]);
  });

  it('plays only the first or last layer at the ends', () => {
    expect([...layerWeights(0, 2, out).slice(0, 2)]).toEqual([1, 0]);
    const end = layerWeights(1, 2, out);
    expect(end[0]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(1, 6);
  });

  it('keeps equal power through a crossfade', () => {
    for (const blend of [0.1, 0.25, 0.5, 0.9]) {
      const w = layerWeights(blend, 2, out);
      expect(w[0] * w[0] + w[1] * w[1]).toBeCloseTo(1, 6);
    }
    expect(layerWeights(0.5, 2, out)[0]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('fades between the two layers either side of the blend', () => {
    const w = layerWeights(1.5, 3, out);
    expect(w[0]).toBe(0);
    expect(w[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(w[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('clamps the blend to the layers', () => {
    expect([...layerWeights(-2, 3, out)]).toEqual([1, 0, 0]);
    const w = layerWeights(9, 3, out);
    expect(w[2]).toBeCloseTo(1, 6);
  });
});

describe('Bed', () => {
  it('does nothing before the engine starts', async () => {
    const idle = new AudioEngine(
      undefined,
      async () => new ArrayBuffer(SECOND)
    );
    const bed = idle.createBed(spec());
    expect(() => bed.set(0.5)).not.toThrow();
    expect(bed.state).toBe('stopped');
  });

  it('starts looping at a random point when its gain rises', () => {
    const bed = engine.createBed(spec());
    expect(sources()).toHaveLength(0);

    bed.set(0.5);
    expect(bed.state).toBe('playing');
    expect(sources()).toHaveLength(1);
    const source = sources()[0];
    expect(source.loop).toBe(true);
    expect(source.offset).toBeCloseTo(0.5, 6);
    expect(source.startedAt).toBe(0);
  });

  it('routes layers through the bed gain into its bus', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    expect(output(bed).outputs).toEqual([engine.bus('weather')]);
  });

  it('routes through a filter when it has one', () => {
    const bed = engine.createBed(spec({ filter: 'lowpass' }));
    bed.set(0.5, 800);
    const filter = output(bed).outputs[0] as FakeBiquadFilterNode;
    expect(filter.kind).toBe('biquad');
    expect(filter.type).toBe('lowpass');
    expect(filter.outputs).toEqual([engine.bus('weather')]);
    expect(filter.frequency.lastTarget!.value).toBe(800);
  });

  it('ramps up over the attack and down over the release', () => {
    const bed = engine.createBed(spec());
    ctx().currentTime = 2;
    bed.set(0.8);
    const gain = output(bed).gain;
    expect(gain.value).toBe(0);
    expect(gain.lastTarget).toEqual({ value: 0.8, time: 2, timeConstant: 0.5 });

    bed.set(0.2);
    expect(gain.lastTarget!.value).toBe(0.2);
    expect(gain.lastTarget!.timeConstant).toBeCloseTo(0.2, 10);
  });

  it('adds no automation when the gain does not change', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    bed.set(0.5);
    bed.set(0.5);
    expect(output(bed).gain.targets).toHaveLength(1);
  });

  it('stops its sources after staying silent', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    const source = sources()[0];
    bed.set(0);

    jest.advanceTimersByTime((BED_STOP_AFTER - 0.1) * 1000);
    expect(bed.state).toBe('playing');
    expect(source.stopped).toBe(false);

    jest.advanceTimersByTime(200);
    expect(bed.state).toBe('stopped');
    expect(source.stopped).toBe(true);
    expect(source.outputs).toHaveLength(0);
  });

  it('waits longer to stop when its release is long', () => {
    const bed = engine.createBed(spec({ release: 2 }));
    bed.set(0.5);
    bed.set(0);
    jest.advanceTimersByTime(5000);
    expect(bed.state).toBe('playing');
    jest.advanceTimersByTime(1100);
    expect(bed.state).toBe('stopped');
  });

  it('keeps playing when the gain rises again before it stops', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    bed.set(0);
    jest.advanceTimersByTime(1000);
    bed.set(0.3);
    jest.advanceTimersByTime(BED_STOP_AFTER * 2000);
    expect(bed.state).toBe('playing');
    expect(sources()).toHaveLength(1);
  });

  it('starts new sources at a new point after it stopped', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    bed.set(0);
    jest.advanceTimersByTime(BED_STOP_AFTER * 1000);

    (Math.random as jest.Mock).mockReturnValue(0.25);
    bed.set(0.5);
    expect(sources()).toHaveLength(2);
    expect(sources()[1].offset).toBeCloseTo(0.25, 6);
    expect(bed.state).toBe('playing');
  });

  it('starts a layer once its sound has loaded', async () => {
    const bed = engine.createBed(spec({ sounds: ['late'] }));
    bed.set(0.5);
    expect(bed.state).toBe('stopped');

    await engine.loadSounds({ sounds: [...manifest.sounds, sound('late')] });
    bed.set(0.5);
    expect(bed.state).toBe('playing');
    expect(sources()).toHaveLength(1);
  });

  it('crossfades its layers', () => {
    const bed = engine.createBed(
      spec({ sounds: ['rain-light', 'rain-heavy'] })
    );
    bed.set(1);
    expect(sources()).toHaveLength(2);
    expect(layerGain(0).gain.value).toBe(1);
    expect(layerGain(1).gain.value).toBe(0);

    bed.setBlend(1);
    expect(layerGain(0).gain.lastTarget!.value).toBeCloseTo(0, 6);
    expect(layerGain(1).gain.lastTarget!.value).toBeCloseTo(1, 6);
    expect(layerGain(1).outputs).toEqual(layerGain(0).outputs);
  });

  it('plays each layer at the gain the manifest picks, through the crossfade', () => {
    const bed = engine.createBed(spec({ sounds: ['breath', 'wind'] }));
    bed.set(1);
    expect(layerGain(0).gain.value).toBeCloseTo(0.5, 6);
    expect(layerGain(1).gain.value).toBe(0);

    bed.setBlend(1);
    expect(layerGain(0).gain.lastTarget!.value).toBeCloseTo(0, 6);
    bed.setBlend(0);
    expect(layerGain(0).gain.lastTarget!.value).toBeCloseTo(0.5, 6);
  });

  it('keeps a blend set before the engine starts', async () => {
    const idle = new AudioEngine(
      undefined,
      async () => new ArrayBuffer(SECOND)
    );
    idle.loadSounds(manifest);
    const bed = idle.createBed(spec({ sounds: ['rain-light', 'rain-heavy'] }));
    bed.setBlend(1);

    await idle.start();
    await idle.bank.decode(idle.context!);
    bed.set(1);
    const fake = idle.context as unknown as FakeAudioContext;
    const heavy = fake.sources[1].outputs[0] as FakeGainNode;
    expect(heavy.gain.value).toBeCloseTo(1, 6);
  });

  it('rebuilds on a new context after the engine restarts', async () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    await engine.close();
    await engine.start();

    bed.set(0.5);
    expect(bed.state).toBe('playing');
    expect(ctx().sources).toHaveLength(1);
    expect(output(bed).outputs).toEqual([engine.bus('weather')]);
  });

  it('ramps its playback rate over the attack', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    ctx().currentTime = 3;
    bed.setRate(1.25);
    const rate = sources()[0].playbackRate;
    expect(rate.lastTarget).toEqual({
      value: 1.25,
      time: 3,
      timeConstant: 0.5,
    });
    bed.setRate(1.25);
    expect(rate.targets).toHaveLength(1);
  });

  it('starts new sources at a rate set before they play', () => {
    const bed = engine.createBed(spec());
    bed.setRate(0.8);
    bed.set(0.5);
    expect(sources()[0].playbackRate.value).toBeCloseTo(0.8, 10);
  });

  it('stops, disconnects and leaves the engine on dispose', () => {
    const bed = engine.createBed(spec());
    bed.set(0.5);
    const source = sources()[0];
    const out = output(bed);
    expect(engine.beds.has(bed)).toBe(true);

    bed.dispose();
    expect(source.stopped).toBe(true);
    expect(out.outputs).toHaveLength(0);
    expect(engine.beds.has(bed)).toBe(false);
    expect(bed.state).toBe('stopped');
  });
});
