import { AudioEngine } from 'rewild-audio';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import { RAIN_HEAVY_LEVEL } from './rainMapping';
import { RainSound, RainWeather } from './RainSound';

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'rain-light': 1000,
  'rain-heavy': 1001,
  'rain-drips': 2000,
};

const manifest = {
  sounds: Object.keys(LENGTHS).map((name) => ({
    name,
    files: [name],
    loop: true,
    source: 'test',
    license: 'own',
  })),
};

let restore: () => void;
let engine: AudioEngine;
let rain: RainSound;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sourcesOf(name: string): FakeAudioBufferSourceNode[] {
  return ctx().sources.filter((s) => s.buffer?.length === LENGTHS[name]);
}

/** The gain a bed layer's source feeds: its crossfade weight. */
function weightOf(name: string): FakeGainNode {
  return sourcesOf(name)[0].outputs[0] as FakeGainNode;
}

/** The bed's own gain, after its layer weights. */
function outOf(name: string): FakeGainNode {
  return weightOf(name).outputs[0] as FakeGainNode;
}

function weather(
  precipitation: number,
  temperature = 0.5,
  film = 0
): RainWeather {
  return { precipitation, temperature, rainWetness: { film } };
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
  rain = new RainSound(engine.createScope());
});

afterEach(() => {
  restore();
});

describe('RainSound', () => {
  it('is silent under a clear sky', () => {
    rain.update(weather(0));
    expect(sourcesOf('rain-light')).toHaveLength(0);
    expect(sourcesOf('rain-drips')).toHaveLength(0);
  });

  it('plays light rain softly and dull in a drizzle', () => {
    rain.update(weather(0.1));
    expect(weightOf('rain-light').gain.value).toBe(1);
    const out = outOf('rain-light');
    expect(out.gain.lastTarget!.value).toBeCloseTo(0.25, 6);
    const filter = out.outputs[0] as FakeBiquadFilterNode;
    expect(filter.frequency.lastTarget!.value).toBeLessThan(8000);
    expect(filter.outputs).toEqual([engine.bus('weather')]);
  });

  it('crossfades to heavy rain in a downpour', () => {
    rain.update(weather(0.1));
    rain.update(weather(1));
    expect(weightOf('rain-heavy').gain.lastTarget!.value).toBeCloseTo(1, 6);
    expect(weightOf('rain-light').gain.lastTarget!.value).toBeCloseTo(0, 6);
    expect(outOf('rain-heavy').gain.lastTarget!.value).toBeCloseTo(
      RAIN_HEAVY_LEVEL,
      6
    );
  });

  it('falls silent in snow', () => {
    rain.update(weather(1));
    rain.update(weather(1, 0));
    expect(rain.share).toBe(0);
    expect(outOf('rain-light').gain.lastTarget!.value).toBe(0);
  });

  it('drips while the world is wet after the rain', () => {
    rain.update(weather(0, 0.5, 0.8));
    const out = outOf('rain-drips');
    expect(out.gain.lastTarget!.value).toBeCloseTo(0.8, 6);
    expect(out.outputs).toEqual([engine.bus('weather')]);
  });

  it('hides the drips under steady rain', () => {
    rain.update(weather(0.6, 0.5, 1));
    expect(sourcesOf('rain-drips')).toHaveLength(0);
  });
});
