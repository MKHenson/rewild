import { Vector2 } from 'rewild-common';
import { BiomeParams, ClimateConfig, MOUNTAIN } from './Biomes';
import {
  SCATTER_INSTANCE_STRIDE,
  ScatterInstances,
  pickScatterInstance,
  scatterChunk,
} from './Scatter';
import {
  SCATTER_LAYERS,
  getScatterLayerSlot,
  scatterExcludeChannel,
  scatterMaskChannels,
} from './ScatterLayers';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import { PaintMask, SCATTER_MASK_STEP, createPaintMask } from './PaintMask';

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

// A density mask over the whole chunk, every texel of `channel` at `weight`.
function scatterMask(channel: number, weight: number, size = CHUNK): PaintMask {
  const mask = createPaintMask(size, scatterMaskChannels(), SCATTER_MASK_STEP);
  const plane = mask.size * mask.size;
  mask.weights.fill(
    Math.round(weight * 255),
    channel * plane,
    (channel + 1) * plane
  );
  return mask;
}

// A chunk size that fits `cellsAcross` pebble cells on each axis. The pebble
// footprint is game content and changes with asset tuning, so tests that need a
// cell count size the chunk from it.
function chunkFitting(cellsAcross: number): number {
  const cell =
    (2 * SCATTER_LAYERS['granite_pebble_01'].footprint) /
    TERRAIN_METERS_PER_SAMPLE;
  return Math.ceil(cellsAcross * cell) + 1;
}

function countOf(results: ScatterInstances[], layer: string): number {
  return results.find((r) => r.layer === layer)?.count ?? 0;
}

describe('scatterChunk', () => {
  const dense = climateOf(flatBiome([{ layer: 'granite_pebble_01', density: 1 }]));

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

    expect(instances.layer).toBe('granite_pebble_01');
    expect(instances.slot).toBe(
      Object.keys(SCATTER_LAYERS).indexOf('granite_pebble_01')
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
      (2 * SCATTER_LAYERS['granite_pebble_01'].footprint) /
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
    const expected = 12 + (SCATTER_LAYERS['granite_pebble_01'].yOffset ?? 0);

    for (const [, y] of positions(instances))
      expect(y).toBeCloseTo(expected, 5);
  });

  it('scales density down to fewer instances', () => {
    const size = chunkFitting(20);
    const heights = flatHeights(size);
    const sparse = climateOf(
      flatBiome([{ layer: 'granite_pebble_01', density: 0.1 }])
    );

    const many = scatterChunk(
      size,
      SEED,
      new Vector2(0, 0),
      dense,
      heights
    )[0];
    const few = scatterChunk(
      size,
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
        { layer: 'granite_pebble_01', density: 1, height: { from: 900, to: 950 } },
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
    const jitter = SCATTER_LAYERS['granite_pebble_01'].jitter.scale;

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

    const climate = climateOf(flatBiome([{ layer: 'oak_01', density: 1 }]));
    const instances = scatterChunk(
      CHUNK,
      SEED,
      new Vector2(0, 0),
      climate,
      heights
    )[0];

    // oak_01 carries a small tilt jitter, so allow for it rather than
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

  describe('painted density', () => {
    const bare = climateOf(flatBiome(undefined));
    const heights = flatHeights(CHUNK);
    const halfDense = climateOf(
      flatBiome([{ layer: 'granite_pebble_01', density: 0.4 }])
    );

    // The palette is the whole library: painting a layer the local biome never
    // emits is the ordinary case with a biome density of zero.
    it('grows a layer no biome in the climate grows', () => {
      const slot = getScatterLayerSlot('alien_plant');
      const results = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        bare,
        heights,
        {
          scatterMask: scatterMask(slot, 1),
        }
      );

      expect(countOf(results, 'alien_plant')).toBeGreaterThan(0);
      expect(results.every((r) => r.layer === 'alien_plant')).toBe(true);
    });

    it('composites over the biome density rather than replacing it', () => {
      const slot = getScatterLayerSlot('granite_pebble_01');
      const biomeOnly = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        halfDense,
        heights
      );
      const painted = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        halfDense,
        heights,
        { scatterMask: scatterMask(slot, 0.5) }
      );

      expect(countOf(painted, 'granite_pebble_01')).toBeGreaterThan(
        countOf(biomeOnly, 'granite_pebble_01')
      );
    });

    it('leaves the biome alone where nothing is painted', () => {
      const plain = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights
      );
      const withMask = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights,
        { scatterMask: scatterMask(getScatterLayerSlot('alien_plant'), 0) }
      );

      expect(countOf(withMask, 'granite_pebble_01')).toBe(
        countOf(plain, 'granite_pebble_01')
      );
    });

    // What a clearing, a building site or a path needs: zero is "say nothing",
    // so removing biome-grown scatter takes a weight of its own.
    it('clears biome-grown scatter through the exclusion channel', () => {
      const results = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights,
        { scatterMask: scatterMask(scatterExcludeChannel(), 1) }
      );

      expect(countOf(results, 'granite_pebble_01')).toBe(0);
    });

    it('exclusion beats paint', () => {
      const mask = scatterMask(getScatterLayerSlot('granite_pebble_01'), 1);
      const plane = mask.size * mask.size;
      const exclude = scatterExcludeChannel();
      mask.weights.fill(255, exclude * plane, (exclude + 1) * plane);

      expect(
        countOf(
          scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights, {
            scatterMask: mask,
          }),
          'granite_pebble_01'
        )
      ).toBe(0);
    });

    // A mask written against a library with a different number of slots would
    // point every channel at the wrong layer; ignoring it scatters from the
    // biome rules alone, which is what an unpainted chunk does.
    it('ignores a mask whose channel count does not match the library', () => {
      const stale = createPaintMask(CHUNK, 1, SCATTER_MASK_STEP);
      stale.weights.fill(255);

      expect(
        countOf(
          scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights, {
            scatterMask: stale,
          }),
          'granite_pebble_01'
        )
      ).toBe(
        countOf(
          scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights),
          'granite_pebble_01'
        )
      );
    });
  });

  describe('kill set', () => {
    const heights = flatHeights(CHUNK);
    const args = [CHUNK, SEED, new Vector2(0, 0), dense, heights] as const;

    // Every instance carries the key that would remove it, so a pick and a
    // kill name the same thing without an index to keep in step.
    it(`reports each instance's kill key only when asked`, () => {
      expect(scatterChunk(...args)[0].ids).toBeUndefined();

      const withIds = scatterChunk(...args, { withIds: true })[0];
      expect(withIds.ids!.length).toBeGreaterThanOrEqual(withIds.count);
      expect(
        new Set(Array.from(withIds.ids!.subarray(0, withIds.count))).size
      ).toBe(withIds.count);
    });

    it('drops exactly the instances the set names', () => {
      const all = scatterChunk(...args, { withIds: true })[0];
      const doomed = all.ids![3];

      const after = scatterChunk(...args, {
        withIds: true,
        killSet: new Set([doomed]),
      })[0];

      expect(after.count).toBe(all.count - 1);
      expect(Array.from(after.ids!.subarray(0, after.count))).not.toContain(
        doomed
      );
    });

    // The whole point of keying on the cell: a kill outlives the ground moving
    // under it, which an index into the instance list would not.
    it('keeps killing the same instance after the heights change', () => {
      const all = scatterChunk(...args, { withIds: true })[0];
      const doomed = all.ids![5];
      const killSet = new Set([doomed]);

      const sculpted = flatHeights(CHUNK, 25);
      const before = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        sculpted,
        {
          withIds: true,
        }
      )[0];
      const after = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        sculpted,
        {
          withIds: true,
          killSet,
        }
      )[0];

      expect(after.count).toBe(before.count - 1);
      expect(Array.from(after.ids!.subarray(0, after.count))).not.toContain(
        doomed
      );
    });
  });

  describe('region', () => {
    const heights = flatHeights(CHUNK);

    // A clipped run has to place exactly what the full run would have inside
    // the box, or the editor's pick would name an instance that is not drawn.
    it('places what the full run placed inside the box, and nothing else', () => {
      const extent = ((CHUNK - 1) / 2) * TERRAIN_METERS_PER_SAMPLE;
      const region = { x0: 4, y0: 4, x1: 12, y1: 12 };

      const full = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights
      )[0];
      const clipped = scatterChunk(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights,
        {
          region,
        }
      )[0];

      const inBox = positions(full).filter(([x, , z]) => {
        const sx = (x + extent) / TERRAIN_METERS_PER_SAMPLE;
        const sy = (extent - z) / TERRAIN_METERS_PER_SAMPLE;
        return (
          sx >= region.x0 &&
          sx <= region.x1 &&
          sy >= region.y0 &&
          sy <= region.y1
        );
      });

      expect(clipped.count).toBeLessThan(full.count);
      const clippedSet = new Set(positions(clipped).map((p) => p.join(',')));
      for (const p of inBox) expect(clippedSet.has(p.join(','))).toBe(true);
    });
  });

  describe('pickScatterInstance', () => {
    const heights = flatHeights(CHUNK);

    it('finds the instance nearest the point, and names its kill key', () => {
      const all = scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights, {
        withIds: true,
      })[0];
      const base = 7 * SCATTER_INSTANCE_STRIDE;
      const target = [all.data[base], all.data[base + 2]];

      const pick = pickScatterInstance(
        CHUNK,
        SEED,
        new Vector2(0, 0),
        dense,
        heights,
        target[0] + 0.2,
        target[1] - 0.2,
        6
      );

      expect(pick).not.toBeNull();
      expect(pick!.key).toBe(all.ids![7]);
      expect(pick!.x).toBeCloseTo(target[0], 5);
      expect(pick!.z).toBeCloseTo(target[1], 5);
      expect(pick!.layer).toBe('granite_pebble_01');
    });

    it('finds nothing where the radius reaches nothing', () => {
      const bare = climateOf(flatBiome(undefined));
      expect(
        pickScatterInstance(
          CHUNK,
          SEED,
          new Vector2(0, 0),
          bare,
          heights,
          0,
          0,
          6
        )
      ).toBeNull();
    });

    // A restore has to be able to point at something that is not drawn.
    it('skips a killed instance unless the kill set is left out', () => {
      const all = scatterChunk(CHUNK, SEED, new Vector2(0, 0), dense, heights, {
        withIds: true,
      })[0];
      const base = 2 * SCATTER_INSTANCE_STRIDE;
      const killSet = new Set([all.ids![2]]);
      const at = (options?: object) =>
        pickScatterInstance(
          CHUNK,
          SEED,
          new Vector2(0, 0),
          dense,
          heights,
          all.data[base],
          all.data[base + 2],
          0.5,
          options
        );

      expect(at()!.key).toBe(all.ids![2]);
      expect(at({ killSet })).toBeNull();
    });
  });

  it('grows past its initial capacity without dropping instances', () => {
    // 32 cells across is 1024 cells, well past the initial capacity of 256.
    const size = chunkFitting(32);
    const instances = scatterChunk(
      size,
      SEED,
      new Vector2(0, 0),
      dense,
      flatHeights(size)
    )[0];

    expect(instances.count).toBeGreaterThan(256);
    for (let i = 0; i < instances.count; i++)
      expect(Number.isFinite(instances.data[i * SCATTER_INSTANCE_STRIDE])).toBe(
        true
      );
  });
});
