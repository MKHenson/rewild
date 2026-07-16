import {
  applySculptStamp,
  SculptHeightSource,
  SculptStamp,
} from './Sculpt';

// A tiny world: chunkSize 5 → span 4, half 2. Chunk (cx, cy) sample (sx, sy)
// sits at world (cx*4 + sx - 2, cy*4 + 2 - sy); adjacent chunks share their
// edge samples, exactly like the real 241-sample chunks.
const CHUNK_SIZE = 5;
const SPAN = CHUNK_SIZE - 1;
const HALF = SPAN / 2;

class FakeSource implements SculptHeightSource {
  chunkSize = CHUNK_SIZE;
  chunks = new Map<string, Float32Array>();
  missing = new Set<string>();

  constructor(
    coords: Array<[number, number]>,
    fill: (wx: number, wz: number) => number = () => 0
  ) {
    for (const [cx, cy] of coords) {
      const heights = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
      for (let sy = 0; sy < CHUNK_SIZE; sy++) {
        for (let sx = 0; sx < CHUNK_SIZE; sx++) {
          const wx = cx * SPAN + sx - HALF;
          const wz = cy * SPAN + HALF - sy;
          heights[sy * CHUNK_SIZE + sx] = fill(wx, wz);
        }
      }
      this.chunks.set(`${cx},${cy}`, heights);
    }
  }

  getHeights(cx: number, cy: number): Float32Array | null {
    const key = `${cx},${cy}`;
    if (this.missing.has(key)) return null;
    return this.chunks.get(key) ?? null;
  }

  // Height at a world sample, read from the given chunk's copy.
  at(cx: number, cy: number, wx: number, wz: number): number {
    const sx = wx - cx * SPAN + HALF;
    const sy = cy * SPAN + HALF - wz;
    return this.chunks.get(`${cx},${cy}`)![sy * CHUNK_SIZE + sx];
  }
}

const stamp = (overrides: Partial<SculptStamp>): SculptStamp => ({
  type: 'raise',
  centerX: 0,
  centerZ: 0,
  radius: 2,
  amount: 1,
  ...overrides,
});

describe('applySculptStamp', () => {
  it('raises with smoothstep falloff — full at centre, zero at the radius', () => {
    const source = new FakeSource([[0, 0]]);
    const touched = applySculptStamp(source, stamp({}));

    expect(touched.map((t) => `${t.cx},${t.cy}`)).toEqual(['0,0']);
    expect(source.at(0, 0, 0, 0)).toBeCloseTo(1); // centre: falloff 1
    expect(source.at(0, 0, 1, 0)).toBeCloseTo(0.5); // half radius: smoothstep 0.5
    expect(source.at(0, 0, 2, 0)).toBe(0); // at the radius: falloff 0
    expect(source.at(0, 0, 2, 2)).toBe(0); // outside the radius
  });

  it('lower mirrors raise', () => {
    const raised = new FakeSource([[0, 0]]);
    const lowered = new FakeSource([[0, 0]]);
    applySculptStamp(raised, stamp({ type: 'raise' }));
    applySculptStamp(lowered, stamp({ type: 'lower' }));

    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      expect(lowered.chunks.get('0,0')![i]).toBeCloseTo(
        -raised.chunks.get('0,0')![i]
      );
    }
  });

  it('flatten moves heights toward the target, scaled by falloff', () => {
    const source = new FakeSource([[0, 0]], (wx) => wx);
    applySculptStamp(source, stamp({ type: 'flatten', target: 10 }));

    expect(source.at(0, 0, 0, 0)).toBeCloseTo(10); // centre snaps to target
    expect(source.at(0, 0, 1, 0)).toBeCloseTo(1 + (10 - 1) * 0.5);
    expect(source.at(0, 0, 2, 0)).toBe(2); // radius edge untouched
  });

  it('flatten without a target is a no-op', () => {
    const source = new FakeSource([[0, 0]], (wx) => wx);
    expect(applySculptStamp(source, stamp({ type: 'flatten' }))).toEqual([]);
    expect(source.at(0, 0, 0, 0)).toBe(0);
  });

  it('smooth pulls samples toward their 3x3 neighbourhood mean', () => {
    const source = new FakeSource([[0, 0]]);
    // A spike at the centre.
    source.chunks.get('0,0')![2 * CHUNK_SIZE + 2] = 9;

    applySculptStamp(source, stamp({ type: 'smooth' }));

    // Centre: mean of 3x3 is 1; full blend at falloff 1.
    expect(source.at(0, 0, 0, 0)).toBeCloseTo(1);
    // Orthogonal neighbour: mean 1, blend = falloff(1/2) = 0.5.
    expect(source.at(0, 0, 1, 0)).toBeCloseTo(0.5);
  });

  it('smoothKernel widens the averaging neighbourhood', () => {
    // A lone spike two samples off-centre: a 3x3 kernel (default) at the
    // centre can't see it, but a kernel of 2 can, so the centre changes.
    const narrow = new FakeSource([[0, 0]]);
    const wide = new FakeSource([[0, 0]]);
    narrow.chunks.get('0,0')![0 * CHUNK_SIZE + 2] = 9; // world (0, 2)
    wide.chunks.get('0,0')![0 * CHUNK_SIZE + 2] = 9;

    applySculptStamp(narrow, stamp({ type: 'smooth' }));
    applySculptStamp(wide, stamp({ type: 'smooth', smoothKernel: 2 }));

    // Centre is world (0,0); the spike sits at (0,2), i.e. 2 rows away.
    expect(narrow.at(0, 0, 0, 0)).toBeCloseTo(0); // out of a 3x3 reach
    expect(wide.at(0, 0, 0, 0)).toBeGreaterThan(0.01); // pulled toward spike
  });

  it('zero amount or zero radius touches nothing', () => {
    const source = new FakeSource([[0, 0]]);
    expect(applySculptStamp(source, stamp({ amount: 0 }))).toEqual([]);
    expect(applySculptStamp(source, stamp({ radius: 0 }))).toEqual([]);
  });

  describe('across a chunk border', () => {
    it('writes identical heights to both copies of shared edge samples', () => {
      const source = new FakeSource([
        [0, 0],
        [1, 0],
      ]);
      // Brush centred exactly on the shared edge column (wx = 2).
      const touched = applySculptStamp(source, stamp({ centerX: 2 }));

      expect(touched.map((t) => `${t.cx},${t.cy}`).sort()).toEqual([
        '0,0',
        '1,0',
      ]);

      // The shared column is chunk (0,0) sx=4 and chunk (1,0) sx=0.
      for (let wz = -2; wz <= 2; wz++) {
        expect(source.at(0, 0, 2, wz)).toBe(source.at(1, 0, 2, wz));
      }
      expect(source.at(0, 0, 2, 0)).toBeCloseTo(1); // centre, on the edge
      expect(source.at(0, 0, 1, 0)).toBeCloseTo(0.5); // one side
      expect(source.at(1, 0, 3, 0)).toBeCloseTo(0.5); // other side
    });

    it('skips shared samples when an owning chunk is unavailable — no one-sided edits', () => {
      const source = new FakeSource([
        [0, 0],
        [1, 0],
      ]);
      source.missing.add('1,0');

      const touched = applySculptStamp(source, stamp({ centerX: 2 }));

      expect(touched.map((t) => `${t.cx},${t.cy}`)).toEqual(['0,0']);
      // Shared edge column untouched on the available side (would seam).
      for (let wz = -2; wz <= 2; wz++) {
        expect(source.at(0, 0, 2, wz)).toBe(0);
      }
      // Interior samples solely owned by chunk (0,0) still sculpt.
      expect(source.at(0, 0, 1, 0)).toBeCloseTo(0.5);
    });

    it('smooth stays consistent across the border', () => {
      // World-consistent slope so smoothing has something to do.
      const fill = (wx: number, wz: number) => wx * wx + wz;
      const a = new FakeSource(
        [
          [0, 0],
          [1, 0],
        ],
        fill
      );
      applySculptStamp(a, stamp({ type: 'smooth', centerX: 2 }));

      for (let wz = -2; wz <= 2; wz++) {
        expect(a.at(0, 0, 2, wz)).toBe(a.at(1, 0, 2, wz));
      }
    });
  });
});
