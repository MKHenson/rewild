import { readFileSync } from 'fs';
import { AudioEngine, OPEN_CUTOFF_HZ, STATE_EASE } from 'rewild-audio';
import { installFakeAudioContext } from 'rewild-audio/lib/testing/FakeAudioContext';
import { DEFAULT_CLIMATE } from 'rewild-renderer/lib/renderers/terrain/Biomes';
import {
  Soundscape,
  SoundscapeBiomes,
  SoundscapeWeather,
  SoundscapesDef,
} from './Soundscape';

const DEF: SoundscapesDef = JSON.parse(
  readFileSync('templates/soundscapes.json', 'utf8')
);

const FOREST = DEFAULT_CLIMATE.biomes.findIndex((b) => b.name === 'forest');
const PLAIN = DEFAULT_CLIMATE.biomes.findIndex((b) => b.name === 'plain');

const frame = 1 / 60;

let restore: () => void;
let engine: AudioEngine;
let scape: Soundscape;
let weather: SoundscapeWeather;
let biomes: {
  climate: typeof DEFAULT_CLIMATE | null;
  count: number;
  biomes: Int32Array;
  weights: Float64Array;
};

function at(...pairs: [number, number][]): void {
  biomes.count = pairs.length;
  pairs.forEach(([biome, weight], i) => {
    biomes.biomes[i] = biome;
    biomes.weights[i] = weight;
  });
}

function gain(sound: string): number {
  const k = scape.sounds.indexOf(sound);
  return k < 0 ? 0 : scape.gains[k];
}

function cutoff(sound: string): number {
  return scape.cutoffs[scape.sounds.indexOf(sound)];
}

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += frame)
    scape.update(weather, biomes as SoundscapeBiomes, frame);
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  engine = new AudioEngine(undefined, async () => new ArrayBuffer(1000));
  await engine.start();
  scape = new Soundscape(DEF, engine.createScope());
  weather = {
    windiness: 0.1,
    gust: 0,
    rain: 0,
    snow: 0,
    wetness: 0,
    fog: 0,
    cloudiness: 0.3,
    sun: 0.6,
    dawn: false,
    moon: 0,
    state: 'Fair',
  };
  biomes = {
    climate: DEFAULT_CLIMATE,
    count: 0,
    biomes: new Int32Array(8),
    weights: new Float64Array(8),
  };
  at([FOREST, 1]);
});

afterEach(() => {
  scape.dispose(0);
  restore();
});

describe('Soundscape', () => {
  it('plays leaves and birds in a forest on a calm day', () => {
    run(frame);
    expect(gain('forest-leaves-calm')).toBeCloseTo(1, 6);
    expect(gain('forest-birds-day')).toBeCloseTo(1, 6);
    expect(gain('forest-night')).toBe(0);
    expect(gain('forest-leaves-gale')).toBe(0);
    expect(cutoff('forest-leaves-calm')).toBe(OPEN_CUTOFF_HZ);
    const bed = [...engine.beds].find(
      (b) => b.spec.sounds[0] === 'forest-birds-day'
    )!;
    expect(bed.spec.bus).toBe('ambience');
    expect(bed.gain).toBeCloseTo(1, 6);
  });

  it('roars, creaks and quiets the birds in a gale', () => {
    weather.windiness = 1;
    run(frame);
    expect(gain('forest-leaves-calm')).toBe(0);
    expect(gain('forest-leaves-gale')).toBeCloseTo(1, 6);
    expect(gain('forest-creak')).toBeCloseTo(1, 6);
    expect(gain('forest-birds-day')).toBeCloseTo(0.3, 6);
  });

  it('patters on the canopy in the rain, and the birds stop', () => {
    weather.rain = 0.5;
    run(frame);
    expect(gain('forest-canopy-rain')).toBeCloseTo(1, 6);
    expect(gain('forest-birds-day')).toBeCloseTo(0.2, 6);
  });

  it('silences the birds in a storm, easing in after the state begins', () => {
    run(frame);
    weather.state = 'Storm';
    run(STATE_EASE / 2);
    const easing = gain('forest-birds-day');
    expect(easing).toBeGreaterThan(0);
    expect(easing).toBeLessThan(1);
    run(STATE_EASE);
    expect(gain('forest-birds-day')).toBe(0);
  });

  it('starts silent in a storm with no ease on a load', () => {
    weather.state = 'Storm';
    run(frame);
    expect(gain('forest-birds-day')).toBe(0);
  });

  it('brings the birds back loud after the storm', () => {
    weather.state = 'Clearing';
    run(frame);
    expect(gain('forest-birds-day')).toBeCloseTo(1.3, 6);
  });

  it('sings louder at dawn, easing in', () => {
    run(frame);
    weather.dawn = true;
    run(frame);
    expect(gain('forest-birds-day')).toBeLessThan(1.1);
    run(STATE_EASE);
    expect(gain('forest-birds-day')).toBeCloseTo(1.6, 6);
  });

  it('plays the night layer instead of the birds at night', () => {
    weather.sun = -0.5;
    run(frame);
    expect(gain('forest-birds-day')).toBe(0);
    expect(gain('forest-night')).toBeCloseTo(1, 6);
  });

  it('dulls everything in snow, and far layers in fog', () => {
    weather.snow = 1;
    run(frame);
    expect(cutoff('forest-leaves-calm')).toBe(2500);
    expect(cutoff('forest-birds-day')).toBe(2500);

    weather.snow = 0;
    weather.fog = 1;
    run(frame);
    expect(cutoff('forest-leaves-calm')).toBe(OPEN_CUTOFF_HZ);
    expect(cutoff('forest-birds-day')).toBe(4000);
  });

  it('plays a biome at its share of the ground', () => {
    at([PLAIN, 0.75], [FOREST, 0.25]);
    run(frame);
    expect(gain('forest-leaves-calm')).toBeCloseTo(0.25, 6);
    expect(scape.profileWeights[scape.names.indexOf('forest')]).toBeCloseTo(
      0.25,
      6
    );
  });

  it('is silent where no biome has a profile, or before the probe', () => {
    at([PLAIN, 1]);
    run(frame);
    expect(scape.gains.every((g) => g === 0)).toBe(true);
    biomes.climate = null;
    at();
    run(frame);
    expect(scape.gains.every((g) => g === 0)).toBe(true);
  });

  it('sums a sound two biomes share, and the lowest cutoff wins', () => {
    scape.dispose(0);
    scape = new Soundscape(
      {
        forest: {
          layers: [{ id: 'air', sound: 'air' }],
          rules: [{ when: { fog: [0, 1] }, muffle: 'air', cutoff: 1000 }],
        },
        plain: { layers: [{ id: 'air', sound: 'air', gain: 0.5 }] },
      },
      engine.createScope()
    );
    at([FOREST, 0.5], [PLAIN, 0.5]);
    weather.fog = 1;
    run(frame);
    expect(scape.sounds).toEqual(['air']);
    expect(gain('air')).toBeCloseTo(0.75, 6);
    expect(cutoff('air')).toBe(1000);
  });

  it('lets a biome turn a base rule off', () => {
    scape.dispose(0);
    scape = new Soundscape(
      { ...DEF, forest: { ...DEF.forest, without: ['rain-quiets-wildlife'] } },
      engine.createScope()
    );
    weather.rain = 0.5;
    run(frame);
    expect(gain('forest-birds-day')).toBeCloseTo(1, 6);
  });

  it('names the profile with a bad rule', () => {
    expect(
      () =>
        new Soundscape(
          { forest: { rules: [{ when: { breeze: [0, 1] }, add: 'x' }] } },
          engine.createScope()
        )
    ).toThrow(/soundscape "forest"/);
  });

  it('owns nothing for the console once disposed', () => {
    expect(Soundscape.current).toBe(scape);
    scape.dispose(0);
    expect(Soundscape.current).toBeNull();
  });
});
