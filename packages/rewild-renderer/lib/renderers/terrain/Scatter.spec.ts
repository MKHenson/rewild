import { Vector2 } from 'rewild-common';
import { BiomeParams, ClimateConfig, MOUNTAIN } from './Biomes';
import {
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
  scatterChunk,
} from './Scatter';
import { SCATTER_LAYERS } from './ScatterLayers';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';

const CHUNK = 33;
const SEED = 1234;

function climateOf(biome: BiomeParams): ClimateConfig {
  return {
    temperature: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    moisture: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    biomes: [biome],
    cells: [[0]],
  };
}

// A single flat biome growing one layer everywhere, so placement is the only
// variable under test.
function flatBiome(scatter: BiomeParams['scatter']): BiomeParams {
  return { ...MOUNTAIN, name: 'test', scatter };
}

function flatHeights(size: number, value = 0): Float32Array {
  return new Float32Array(size * size).fill(value);
}

function positions(instances: ScatterInstances): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < instances.count; i++) {
    const base = i * SCATTER_INSTANCE_STRIDE;
    out.push([
      instances.data[base],
      instances.data[base + 1],
      instances.data[base + 2],
    ]);
  }
  return out;
}

describe('scatterChunk', () => {
  const dense = climateOf(flatBiome([{ layer: 'granite_pebble', density: 1 }]));

  it('returns nothing for a climate that grows nothing', () => {
    const climate = climateOf(flatBiome(undefined));
    expect(
      scatterChunk(CHUNK, SEED, new Vector2(0, 0), climate, flatHeights(CHUNK))
    ).toEqual([]);
  });

  it('rejects a heightfield that is not the chunk size', () => {
    expect(() =>
      scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, flatHeights(8))
    ).toThrow(/Scatter needs/);
  });

  it('places instances and tags them with their library slot', () => {
    const [instances] = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK)
    );

    expect(instances.layer).toBe('granite_pebble');
    expect(instances.slot).toBe(
      Object.keys(SCATTER_LAYERS).indexOf('granite_pebble')
    );
    expect(instances.count).toBeGreaterThan(0);
    expect(instances.data.length).toBeGreaterThanOrEqual(
      instances.count * SCATTER_INSTANCE_STRIDE
    );
  });

  it('is a pure function of its inputs', () => {
    const args = [
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK),
    ] as const;
    const first = scatterChunk(...args)[0];
    const second = scatterChunk(...args)[0];

    expect(second.count).toBe(first.count);
    expect(Array.from(second.data.subarray(0, first.count))).toEqual(
      Array.from(first.data.subarray(0, first.count))
    );
  });

  it('re-rolls on a different seed', () => {
    const heights = flatHeights(CHUNK);
    const a = scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights)[0];
    const b = scatterChunk(CHUNK, 99, new Vector2(0, 0), dense, heights)[0];
    expect(Array.from(b.data.subarray(0, 32))).not.toEqual(
      Array.from(a.data.subarray(0, 32))
    );
  });

  // The whole point of hashing global cell coordinates: a world position
  // resolves the same way whichever chunk owns it, so no instance is placed
  // twice or dropped at a shared border.
  it('agrees with the neighbouring chunk across a shared border', () => {
    const span = CHUNK - 1;
    const heights = flatHeights(CHUNK);

    const left = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      heights
    )[0];
    const right = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(span, 0),
      dense,
      heights
    )[0];

    // Convert both to global sample-space x, then check no instance appears in
    // both and that the pair covers the seam without a gap wider than a cell.
    const cell =
      (2 * SCATTER_LAYERS['granite_pebble'].footprint) /
      TERRAIN_METERS_PER_SAMPLE;
    const half = span / 2;
    const toGlobal = (instances: ScatterInstances, originX: number) =>
      positions(instances).map(
        ([x]) => originX + x / TERRAIN_METERS_PER_SAMPLE + half
      );

    const leftX = toGlobal(left, 0);
    const rightX = toGlobal(right, span);

    // Half-open ownership: the left chunk stops before the border, the right
    // starts at it.
    expect(Math.max(...leftX)).toBeLessThan(span);
    expect(Math.min(...rightX)).toBeGreaterThanOrEqual(span);

    // And nothing is lost in between — the gap across the seam is no wider than
    // one cell's worth of jitter.
    expect(
      span - Math.max(...leftX) + (Math.min(...rightX) - span)
    ).toBeLessThan(2 * cell);
  });

  it('keeps every instance inside its own chunk', () => {
    const instances = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK)
    )[0];
    const extent = ((CHUNK - 1) / 2) * TERRAIN_METERS_PER_SAMPLE;

    for (const [x, , z] of positions(instances)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(extent);
      expect(Math.abs(z)).toBeLessThanOrEqual(extent);
    }
  });

  it('takes Y from the heightfield plus the layer yOffset', () => {
    const instances = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK, 12)
    )[0];
    const expected = 12 + (SCATTER_LAYERS['granite_pebble'].yOffset ?? 0);

    for (const [, y] of positions(instances))
      expect(y).toBeCloseTo(expected, 5);
  });

  it('scales density down to fewer instances', () => {
    const heights = flatHeights(CHUNK);
    const sparse = climateOf(
      flatBiome([{ layer: 'granite_pebble', density: 0.1 }])
    );

    const many = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      heights
    )[0];
    const few = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      sparse,
      heights
    )[0];

    expect(few.count).toBeLessThan(many.count);
    expect(few.count).toBeGreaterThan(0);
  });

  it('places nothing where a selector excludes the whole chunk', () => {
    const climate = climateOf(
      flatBiome([
        { layer: 'granite_pebble', density: 1, height: { from: 900, to: 950 } },
      ])
    );
    expect(
      scatterChunk(CHUNK, SEED, new Vector2(0, 0), climate, flatHeights(CHUNK))
    ).toEqual([]);
  });

  it('writes a normalised quaternion, a jittered scale and a phase', () => {
    const instances = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK)
    )[0];
    const jitter = SCATTER_LAYERS['granite_pebble'].jitter.scale;

    for (let i = 0; i < instances.count; i++) {
      const base = i * SCATTER_INSTANCE_STRIDE;
      const x = instances.data[base + 3];
      const y = instances.data[base + 4];
      const z = instances.data[base + 5];
      const w = instances.data[base + 6];
      expect(Math.sqrt(x * x + y * y + z * z + w * w)).toBeCloseTo(1, 4);

      expect(instances.data[base + 7]).toBeGreaterThanOrEqual(jitter.from);
      expect(instances.data[base + 7]).toBeLessThanOrEqual(jitter.to);

      expect(instances.data[base + 8]).toBeGreaterThanOrEqual(0);
      expect(instances.data[base + 8]).toBeLessThan(1);
    }
  });

  // alignToNormal 0 must leave instances upright regardless of the ground, and
  // a yaw-only rotation is a quaternion with no x or z component.
  it('keeps an unaligned layer upright on a slope', () => {
    const heights = new Float32Array(CHUNK * CHUNK);
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) heights[y * CHUNK + x] = x * 3;

    const climate = climateOf(
      flatBiome([{ layer: 'alien_plant', density: 1 }])
    );
    const instances = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      climate,
      heights
    )[0];

    // alien_plant carries a small tilt jitter, so allow for it rather than
    // demanding an exact yaw-only quaternion.
    for (let i = 0; i < instances.count; i++) {
      const base = i * SCATTER_INSTANCE_STRIDE;
      const x = instances.data[base + 3];
      const z = instances.data[base + 5];
      expect(Math.sqrt(x * x + z * z)).toBeLessThan(0.05);
    }
  });

  it('lays an aligned layer onto a slope', () => {
    const heights = new Float32Array(CHUNK * CHUNK);
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) heights[y * CHUNK + x] = x * 3;

    const flat = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(CHUNK)
    )[0];
    const sloped = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      dense,
      heights
    )[0];

    const tiltOf = (instances: ScatterInstances) => {
      let total = 0;
      for (let i = 0; i < instances.count; i++) {
        const base = i * SCATTER_INSTANCE_STRIDE;
        const x = instances.data[base + 3];
        const z = instances.data[base + 5];
        total += Math.sqrt(x * x + z * z);
      }
      return total / instances.count;
    };

    expect(tiltOf(sloped)).toBeGreaterThan(tiltOf(flat));
  });

  it('grows past its initial capacity without dropping instances', () => {
    const instances = scatterChunk(
      129,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(129)
    )[0];

    expect(instances.count).toBeGreaterThan(256);
    for (let i = 0; i < instances.count; i++)
      expect(Number.isFinite(instances.data[i * SCATTER_INSTANCE_STRIDE])).toBe(
        true
      );
  });
});
