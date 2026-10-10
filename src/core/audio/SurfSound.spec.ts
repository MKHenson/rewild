import { Vector3 } from 'rewild-common';
import { AudioEngine } from 'rewild-audio';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakePannerNode,
  installFakeAudioContext,
} from 'rewild-audio/lib/testing/FakeAudioContext';
import type { ShorePoint } from 'rewild-renderer/lib/renderers/water/ShoreField';
import { SurfSound, SurfWater } from './SurfSound';

// Each file decodes to a buffer whose length says which sound it is.
const LENGTHS: Record<string, number> = {
  'surf-calm': 1000,
  'surf-storm': 1001,
  'lake-lapping': 2000,
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

/** A beach at x = 100 the ocean's waves reach, and a lake west of x = 0. */
function water(beach = true, lake = true): SurfWater {
  return {
    seaLevel: 2,
    lapping: [0, 1],
    nearestShore(x: number, z: number, out: ShorePoint) {
      if (!beach) return false;
      out.x = 100;
      out.z = z;
      out.distance = Math.abs(100 - x);
      out.strength = 1;
      return true;
    },
    sample(x, z, out) {
      out.wet = lake && x < 0;
      out.level = out.wet ? 5 : -Infinity;
      out.typeWeights.fill(0);
      if (out.wet) out.typeWeights[1] = 1;
      return true;
    },
  };
}

let restore: () => void;
let engine: AudioEngine;
let surf: SurfSound;

function ctx(): FakeAudioContext {
  return engine.context as unknown as FakeAudioContext;
}

function sourcesOf(name: string): FakeAudioBufferSourceNode[] {
  return ctx().sources.filter((s) => s.buffer?.length === LENGTHS[name]);
}

function pannerOf(name: string): FakePannerNode {
  return sourcesOf(name)[0].outputs[0].outputs[0].outputs[0] as FakePannerNode;
}

function stand(x: number) {
  engine.setListener(
    new Vector3(x, 0, 0),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0)
  );
}

function step(w: SurfWater, windiness: number, seconds = 0.1) {
  surf.update(w, windiness, seconds);
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
  surf = new SurfSound(engine, engine.createScope());
});

afterEach(() => {
  restore();
});

describe('SurfSound', () => {
  it('washes from the beach on a calm sea', () => {
    stand(60);
    step(water(true, false), 0);
    expect(sourcesOf('surf-calm')).toHaveLength(1);
    expect(sourcesOf('surf-storm')).toHaveLength(0);
    const panner = pannerOf('surf-calm');
    expect(panner.positionX.value).toBeCloseTo(100, 6);
    expect(panner.positionY.value).toBeCloseTo(3, 6);
    expect(panner.rolloffFactor).toBe(0);
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.outputs).toEqual([engine.bus('ambience')]);
  });

  it('crashes on a storm sea', () => {
    stand(60);
    step(water(true, false), 1);
    expect(sourcesOf('surf-storm')).toHaveLength(1);
    expect(sourcesOf('surf-calm')).toHaveLength(0);
  });

  it('is silent far inland', () => {
    stand(-2000);
    step(water(true, false), 1);
    expect(sourcesOf('surf-storm')).toHaveLength(0);
  });

  it('is silent with no shore the waves reach', () => {
    stand(60);
    step(water(false, false), 1);
    expect(sourcesOf('surf-calm')).toHaveLength(0);
    expect(sourcesOf('surf-storm')).toHaveLength(0);
  });

  it('laps from the lake shore', () => {
    stand(10);
    step(water(false, true), 0);
    expect(sourcesOf('lake-lapping')).toHaveLength(1);
    const panner = pannerOf('lake-lapping');
    expect(panner.positionX.value).toBeCloseTo(0, 0);
    expect(panner.positionY.value).toBeCloseTo(6, 6);
  });

  it('glides the lapping along the shore as the listener walks', () => {
    stand(10);
    step(water(false, true), 0);
    engine.setListener(
      new Vector3(10, 0, 4),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    step(water(false, true), 0, 0.3);
    const z = pannerOf('lake-lapping').positionZ.lastTarget!.value;
    expect(z).toBeGreaterThan(0.5);
    expect(z).toBeLessThan(4);
  });

  it('has no lapping far from the lake', () => {
    stand(200);
    step(water(false, true), 1);
    expect(sourcesOf('lake-lapping')).toHaveLength(0);
  });
});
