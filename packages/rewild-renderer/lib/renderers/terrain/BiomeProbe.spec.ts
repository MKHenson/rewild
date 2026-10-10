import { Vector2 } from 'rewild-common';
import {
  ARID_CLIMATE,
  ARID_CLIMATE_PRESET,
  DEFAULT_CLIMATE,
  DEFAULT_CLIMATE_PRESET,
} from './Biomes';
import { BiomeProbe, BiomeProbeTerrain } from './BiomeProbe';
import { createClimateField, resolveBiomeWeights } from './ClimateField';
import { worldToLakeSpace } from './Lakes';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { PaintMask, createPaintMask } from './PaintMask';

const SEED = 31337;
const SIZE = 241;
const SPAN = (SIZE - 1) * TERRAIN_METERS_PER_SAMPLE;

function makeTerrain(): BiomeProbeTerrain & {
  seed: number;
  climatePreset: string;
  terrainChunks: Map<string, { biomeMask: PaintMask | null }>;
} {
  return {
    seed: SEED,
    climatePreset: DEFAULT_CLIMATE_PRESET,
    mapChunkSizeLod: SIZE,
    metersPerSample: TERRAIN_METERS_PER_SAMPLE,
    terrainChunks: new Map(),
  };
}

function paint(mask: PaintMask, channel: number, value: number): void {
  const plane = mask.size * mask.size;
  mask.weights.fill(value, channel * plane, (channel + 1) * plane);
}

function probedWeight(probe: BiomeProbe, biome: number): number {
  for (let i = 0; i < probe.count; i++)
    if (probe.biomes![i] === biome) return probe.weights![i];
  return 0;
}

function sum(probe: BiomeProbe): number {
  let total = 0;
  for (let i = 0; i < probe.count; i++) total += probe.weights![i];
  return total;
}

// World points spread over several chunks, a long way apart in climate.
const POINTS: [number, number][] = [];
for (let i = 0; i < 40; i++)
  POINTS.push([((i * 7919) % 60000) - 30000, ((i * 104729) % 60000) - 30000]);

describe('BiomeProbe', () => {
  it('matches the world climate field where nothing is painted', () => {
    const terrain = makeTerrain();
    const probe = new BiomeProbe();
    const field = createClimateField(
      0,
      0,
      SEED,
      new Vector2(0, 0),
      DEFAULT_CLIMATE
    );
    const lakeSpace = new Float64Array(2);
    const biomes = new Int32Array(4);
    const weights = new Float64Array(4);

    for (const [x, z] of POINTS) {
      probe.probe(terrain, x, z);
      worldToLakeSpace(x, z, lakeSpace);
      const count = resolveBiomeWeights(
        field,
        lakeSpace[0],
        lakeSpace[1],
        biomes,
        weights
      );
      expect(probe.count).toBe(count);
      for (let i = 0; i < count; i++)
        expect(probedWeight(probe, biomes[i])).toBeCloseTo(weights[i], 6);
    }
  });

  it('gives a fully painted biome all the weight', () => {
    const terrain = makeTerrain();
    const mask = createPaintMask(SIZE, DEFAULT_CLIMATE.biomes.length);
    paint(mask, 1, 255);
    terrain.terrainChunks.set('2,-1', { biomeMask: mask });
    const probe = new BiomeProbe();

    expect(probe.probe(terrain, 2 * SPAN + 10, -SPAN - 30)).toBe(1);
    expect(probe.biomes![0]).toBe(1);
    expect(probe.weights![0]).toBe(1);
    expect(probe.weightOf(DEFAULT_CLIMATE.biomes[1].name)).toBe(1);
  });

  it('leaves the climate the share paint does not take', () => {
    const terrain = makeTerrain();
    const mask = createPaintMask(SIZE, DEFAULT_CLIMATE.biomes.length);
    terrain.terrainChunks.set('0,0', { biomeMask: mask });
    const probe = new BiomeProbe();
    probe.probe(terrain, 50, 50);
    const native = probe.biomes![0];
    const nativeWeight = probe.weights![0];
    const other = native === 0 ? 1 : 0;
    const otherWeight = probedWeight(probe, other);

    paint(mask, other, 51);
    probe.probe(terrain, 50, 50);
    expect(probedWeight(probe, other)).toBeCloseTo(0.2 + 0.8 * otherWeight, 6);
    expect(probedWeight(probe, native)).toBeCloseTo(0.8 * nativeWeight, 6);
    expect(sum(probe)).toBeCloseTo(1, 9);
  });

  it('reads paint added after the chunk was first probed', () => {
    const terrain = makeTerrain();
    const chunk: { biomeMask: PaintMask | null } = { biomeMask: null };
    terrain.terrainChunks.set('0,0', chunk);
    const probe = new BiomeProbe();
    probe.probe(terrain, 0, 0);

    const mask = createPaintMask(SIZE, DEFAULT_CLIMATE.biomes.length);
    paint(mask, 2, 255);
    chunk.biomeMask = mask;
    probe.probe(terrain, 0, 0);
    expect(probe.count).toBe(1);
    expect(probe.biomes![0]).toBe(2);
  });

  it('ignores a mask painted for another biome count', () => {
    const terrain = makeTerrain();
    const mask = createPaintMask(SIZE, DEFAULT_CLIMATE.biomes.length + 1);
    paint(mask, 0, 255);
    terrain.terrainChunks.set('0,0', { biomeMask: mask });
    const probe = new BiomeProbe();
    const unpainted = new BiomeProbe();

    probe.probe(terrain, 0, 0);
    unpainted.probe(makeTerrain(), 0, 0);
    expect(probe.count).toBe(unpainted.count);
    for (let i = 0; i < probe.count; i++)
      expect(probe.weights![i]).toBe(unpainted.weights![i]);
  });

  it('follows a change of climate preset', () => {
    const terrain = makeTerrain();
    const probe = new BiomeProbe();
    probe.probe(terrain, 0, 0);
    expect(probe.climate).toBe(DEFAULT_CLIMATE);

    terrain.climatePreset = ARID_CLIMATE_PRESET;
    probe.probe(terrain, 0, 0);
    expect(probe.climate).toBe(ARID_CLIMATE);
    expect(sum(probe)).toBeCloseTo(1, 9);
  });

  it('gives weights that sum to 1 across chunk borders', () => {
    const terrain = makeTerrain();
    const probe = new BiomeProbe();
    for (const [x, z] of POINTS) {
      probe.probe(terrain, x, z);
      expect(sum(probe)).toBeCloseTo(1, 9);
    }
  });
});
