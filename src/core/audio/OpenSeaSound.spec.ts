import { Vector3 } from 'rewild-common';
import { AudioEngine, Bed } from 'rewild-audio';
import { installFakeAudioContext } from 'rewild-audio/lib/testing/FakeAudioContext';
import { OpenSeaSound, SeaWater } from './OpenSeaSound';
import { OPEN_SEA_FAR, SURF_CALM_LEVEL } from './surfMapping';

const LENGTHS: Record<string, number> = {
  'sea-calm': 1000,
  'sea-storm': 1001,
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

/** Ocean (palette 0) east of x = 0 at level 2, a lake (palette 1) west of it. */
function water(blend = 0): SeaWater {
  return {
    ocean: [1, 0],
    sample(x, z, out) {
      out.wet = true;
      out.level = 2;
      out.coverage = 1;
      out.typeWeights.fill(0);
      if (x >= 0) {
        out.typeWeights[0] = 1 - blend;
        out.typeWeights[1] = blend;
      } else out.typeWeights[1] = 1;
      return true;
    },
  };
}

const dry: SeaWater = {
  ocean: [1, 0],
  sample(x, z, out) {
    out.wet = false;
    out.typeWeights.fill(0);
    return true;
  },
};

let restore: () => void;
let engine: AudioEngine;
let sea: OpenSeaSound;

function bed(): Bed {
  return [...engine.beds].find((b) => b.spec.sounds[0] === 'sea-calm')!;
}

function at(x: number, y: number) {
  engine.setListener(
    new Vector3(x, y, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
}

beforeEach(async () => {
  restore = installFakeAudioContext();
  engine = new AudioEngine(
    undefined,
    async (url) => new ArrayBuffer(LENGTHS[url])
  );
  await engine.start();
  await engine.loadSounds(manifest);
  sea = new OpenSeaSound(engine, engine.createScope());
});

afterEach(() => {
  restore();
});

describe('OpenSeaSound', () => {
  it('plays all around a swimmer far out on a calm sea', () => {
    at(5000, 2);
    sea.update(water(), 0, 0.1);
    expect(bed().gain).toBeCloseTo(SURF_CALM_LEVEL, 6);
    expect(bed().blend).toBe(0);
    expect(bed().spec.bus).toBe('ambience');
  });

  it('rises into the storm loop as the sea rises', () => {
    at(5000, 2);
    sea.update(water(), 1, 0.1);
    expect(bed().gain).toBeCloseTo(1, 6);
    expect(bed().blend).toBe(1);
  });

  it('fades out as the listener rises above the sea', () => {
    at(5000, 2 + OPEN_SEA_FAR / 2);
    sea.update(water(), 0, 0.1);
    const half = bed().gain;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(SURF_CALM_LEVEL);
    at(5000, 2 + OPEN_SEA_FAR);
    sea.update(water(), 0, 0.1);
    expect(bed().gain).toBe(0);
  });

  it('plays under water too, for the world muffle to dull', () => {
    at(5000, -3);
    sea.update(water(), 0, 0.1);
    expect(bed().gain).toBeCloseTo(SURF_CALM_LEVEL, 6);
  });

  it('plays by the ocean share of a lagoon, and not on a lake or land', () => {
    at(100, 2);
    sea.update(water(0.75), 0, 0.1);
    expect(bed().gain).toBeCloseTo(0.25 * SURF_CALM_LEVEL, 6);

    sea.update(water(), 0, 0.2);
    at(-100, 2);
    sea.update(water(), 0, 0.2);
    expect(bed().gain).toBe(0);

    sea.update(dry, 0, 0.2);
    expect(bed().gain).toBe(0);
  });
});
