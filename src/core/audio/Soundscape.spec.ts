import { readFileSync } from 'fs';
import { AudioEngine, OPEN_CUTOFF_HZ, STATE_EASE } from 'rewild-audio';
import { installFakeAudioContext } from 'rewild-audio/lib/testing/FakeAudioContext';
import {
  ARID_CLIMATE,
  ClimateConfig,
  DEFAULT_CLIMATE,
} from 'rewild-renderer/lib/renderers/terrain/Biomes';
import {
  SOUNDSCAPE_LEVEL,
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
const MOUNTAIN = DEFAULT_CLIMATE.biomes.findIndex((b) => b.name === 'mountain');

function biomeIn(climate: ClimateConfig, name: string): number {
  return climate.biomes.findIndex((b) => b.name === name);
}

/** Counts each sound's wants, as the bank does. */
class FakeBank {
  readonly wants = new Map<string, number>();
  want(name: string): void {
    this.wants.set(name, (this.wants.get(name) ?? 0) + 1);
  }
  release(name: string): void {
    const n = (this.wants.get(name) ?? 0) - 1;
    if (n < 0) throw new Error(`released ${name} more than wanted`);
    if (n === 0) this.wants.delete(name);
    else this.wants.set(name, n);
  }
  get loaded(): string[] {
    return [...this.wants.keys()].sort();
  }
}

const frame = 1 / 60;

let restore: () => void;
let engine: AudioEngine;
let scape: Soundscape;
let weather: SoundscapeWeather;
let biomes: {
  climate: ClimateConfig | null;
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
    shore: 0,
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
    expect(bed.gain).toBeCloseTo(SOUNDSCAPE_LEVEL, 6);
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
    scape.dispose(0);
    scape = new Soundscape(
      { '*': DEF['*'], forest: DEF.forest },
      engine.createScope()
    );
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

  it('has its own day and night on the plain', () => {
    at([PLAIN, 1]);
    run(frame);
    expect(gain('plain-grass-calm')).toBeCloseTo(1, 6);
    expect(gain('plain-birds')).toBeCloseTo(1, 6);
    expect(gain('plain-crickets')).toBe(0);
    weather.sun = -0.5;
    weather.windiness = 1;
    run(frame);
    expect(gain('plain-birds')).toBe(0);
    expect(gain('plain-crickets')).toBeCloseTo(0.3, 6);
    expect(gain('plain-grass-calm')).toBe(0);
    expect(gain('plain-grass-wind')).toBeCloseTo(1, 6);
  });

  it('whistles on the mountain in a gale', () => {
    at([MOUNTAIN, 1]);
    run(frame);
    expect(gain('mountain-whistle')).toBe(0);
    weather.windiness = 1;
    run(frame);
    expect(gain('mountain-whistle')).toBeCloseTo(1, 6);
    expect(gain('mountain-birds')).toBeCloseTo(0.3, 6);
  });

  it('reverberates in the mountains, by their share of the ground', () => {
    run(frame);
    expect(scape.reverb).toBe(0);
    at([MOUNTAIN, 1]);
    run(frame);
    expect(scape.reverb).toBeCloseTo(1, 6);
    at([MOUNTAIN, 0.25], [FOREST, 0.75]);
    run(frame);
    expect(scape.reverb).toBeCloseTo(0.25, 6);

    biomes.climate = ARID_CLIMATE;
    at([biomeIn(ARID_CLIMATE, 'desert-mountain'), 1]);
    run(frame);
    expect(scape.reverb).toBeGreaterThan(0.5);
    at([biomeIn(ARID_CLIMATE, 'dunes'), 1]);
    run(frame);
    expect(scape.reverb).toBe(0);
  });

  it('keeps the palm forest cicadas in wind, but not in rain', () => {
    biomes.climate = ARID_CLIMATE;
    at([biomeIn(ARID_CLIMATE, 'palm-forest'), 1]);
    weather.windiness = 1;
    run(frame);
    expect(gain('desert-cicadas')).toBeCloseTo(1, 6);
    expect(gain('desert-sand')).toBeCloseTo(1, 6);
    weather.rain = 0.5;
    run(frame);
    expect(gain('desert-cicadas')).toBeCloseTo(0.2, 6);
  });

  it('plays gulls by the shore in any biome, by day only', () => {
    run(frame);
    expect(gain('beach-gulls')).toBe(0);
    weather.shore = 0.5;
    run(frame);
    expect(gain('beach-gulls')).toBeCloseTo(1, 6);

    at([PLAIN, 0.5], [FOREST, 0.5]);
    run(frame);
    expect(gain('beach-gulls')).toBeCloseTo(1, 6);

    weather.sun = -0.5;
    run(frame);
    expect(gain('beach-gulls')).toBe(0);
  });

  it('quiets the gulls in rain like any wildlife', () => {
    weather.shore = 1;
    weather.rain = 0.5;
    run(frame);
    expect(gain('beach-gulls')).toBeCloseTo(0.2, 6);
  });

  it('blows the air louder on the open dunes than in the palm forest', () => {
    biomes.climate = ARID_CLIMATE;
    at([biomeIn(ARID_CLIMATE, 'palm-forest'), 1]);
    run(frame);
    const sheltered = gain('desert-air');
    at([biomeIn(ARID_CLIMATE, 'dunes'), 1]);
    run(frame);
    expect(gain('desert-air')).toBeGreaterThan(sheltered * 3);
  });

  it('plays open desert on the dunes: no birds or day insects', () => {
    biomes.climate = ARID_CLIMATE;
    at([biomeIn(ARID_CLIMATE, 'dunes'), 1]);
    weather.shore = 1;
    weather.windiness = 1;
    run(frame);
    expect(gain('desert-air')).toBeCloseTo(0.5, 6);
    expect(gain('desert-sand')).toBeCloseTo(1, 6);
    expect(gain('desert-cicadas')).toBe(0);
    expect(gain('beach-gulls')).toBe(0);

    weather.sun = -0.5;
    weather.windiness = 0;
    run(frame);
    expect(gain('desert-night')).toBeCloseTo(1, 6);
  });

  it('crossfades between biomes as the ground changes', () => {
    at([PLAIN, 0.6], [FOREST, 0.4]);
    run(frame);
    expect(gain('plain-grass-calm')).toBeCloseTo(0.6, 6);
    expect(gain('forest-leaves-calm')).toBeCloseTo(0.4, 6);
  });

  it("loads only the sounds of the climate's biomes", () => {
    scape.dispose(0);
    const bank = new FakeBank();
    scape = new Soundscape(DEF, engine.createScope(), bank);
    expect(bank.loaded).toEqual([]);

    run(frame);
    expect(bank.loaded).toContain('forest-birds-day');
    expect(bank.loaded).toContain('plain-crickets');
    expect(bank.loaded).toContain('mountain-whistle');
    expect(bank.loaded.some((s) => s.startsWith('desert'))).toBe(false);
    expect(bank.loaded).toContain('beach-gulls');

    biomes.climate = ARID_CLIMATE;
    at([biomeIn(ARID_CLIMATE, 'palm-forest'), 1]);
    run(frame);
    expect(bank.loaded.some((s) => /^(forest|plain)-/.test(s))).toBe(false);
    expect(bank.loaded).not.toContain('mountain-air');
    expect(bank.loaded).toContain('desert-cicadas');
    expect(bank.loaded).toContain('beach-gulls');
    expect(bank.wants.get('mountain-whistle')).toBe(1);

    scape.dispose(0);
    expect(bank.loaded).toEqual([]);
  });

  it('owns nothing for the console once disposed', () => {
    expect(Soundscape.current).toBe(scape);
    scape.dispose(0);
    expect(Soundscape.current).toBeNull();
  });
});
