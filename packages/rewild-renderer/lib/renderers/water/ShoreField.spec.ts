import { fromFloat16 } from '../../utils/float16';
import {
  SWASH_REACH_TEXELS,
  collectShore,
  extendArrival,
  packShoreField,
  packSwashField,
  solveArrival,
} from './ShoreField';

const SIZE = 32;
const TEXEL = 8;
const SOURCE = 24;

// Deep water at x = 0 shoaling to a beach at x = 24, land past it.
function beach(): Float32Array {
  const depth = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      depth[x + y * SIZE] = Math.max(0, 30 * (1 - x / 24));
  return depth;
}

function solve(depth: Float32Array): Float32Array {
  const times = new Float32Array(SIZE * SIZE);
  solveArrival(depth, SIZE, TEXEL, SOURCE, times);
  return times;
}

describe('solveArrival', () => {
  it('starts in deep water and slows as the beach shoals', () => {
    const times = solve(beach());
    const row = 10 * SIZE;
    expect(times[row]).toBe(0);
    let last = 0;
    let lastStep = 0;
    for (let x = 5; x < 24; x++) {
      const step = times[row + x] - last;
      expect(step).toBeGreaterThan(0);
      // Shallower water is slower, so each texel takes longer to cross.
      if (x > 6) expect(step).toBeGreaterThanOrEqual(lastStep - 1e-4);
      lastStep = step;
      last = times[row + x];
    }
    expect(times[row + 24]).toBe(Infinity);
  });

  it('matches a shallow-water wave crossing flat water', () => {
    const depth = new Float32Array(SIZE * SIZE).fill(5);
    for (let y = 0; y < SIZE; y++) depth[y * SIZE] = SOURCE;
    const times = solve(depth);
    const expected = (20 * TEXEL) / Math.sqrt(9.81 * 5);
    expect(times[20 + 5 * SIZE]).toBeCloseTo(expected, 3);
  });

  it('wraps around an island and leaves an enclosed lagoon dry', () => {
    const depth = new Float32Array(SIZE * SIZE).fill(10);
    for (let y = 0; y < SIZE; y++) depth[y * SIZE] = SOURCE;
    // An island wall from y = 4 to 27 at x = 10.
    for (let y = 4; y < 28; y++) depth[10 + y * SIZE] = 0;
    // A lagoon ringed by land.
    for (let y = 12; y <= 18; y++)
      for (let x = 20; x <= 26; x++)
        depth[x + y * SIZE] = y === 12 || y === 18 || x === 20 || x === 26 ? 0 : 3;
    const times = solve(depth);

    const behind = times[11 + 16 * SIZE];
    const open = times[11 + 1 * SIZE];
    expect(behind).toBeLessThan(Infinity);
    expect(behind).toBeGreaterThan(open);
    expect(times[23 + 15 * SIZE]).toBe(Infinity);
  });

  it('starts on a wide shelf from its deepest water', () => {
    // A shelf 12 m deep at x = 0 shoaling to a beach at x = 24.
    const depth = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        depth[x + y * SIZE] = Math.max(0, 12 * (1 - x / 24));
    const times = new Float32Array(SIZE * SIZE);
    const from = solveArrival(depth, SIZE, TEXEL, SOURCE, times);
    expect(from).toBeCloseTo(10, 5);
    const row = 10 * SIZE;
    expect(times[row]).toBe(0);
    for (let x = 5; x < 24; x++)
      expect(times[row + x]).toBeGreaterThan(times[row + x - 1]);
  });

  it('starts none in a pool no deeper than its band', () => {
    const depth = new Float32Array(SIZE * SIZE);
    for (let y = 8; y < 24; y++)
      for (let x = 8; x < 24; x++) depth[x + y * SIZE] = 1.5;
    const times = new Float32Array(SIZE * SIZE);
    expect(solveArrival(depth, SIZE, TEXEL, SOURCE, times)).toBe(0);
    expect(times.every((t) => t === Infinity)).toBe(true);
  });

  it('starts a bay cut off from deep water where it meets the edge', () => {
    // Deep water in the left half, a bay in the right half that joins it
    // only outside the grid, past the land wall at x = 16.
    const depth = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        depth[x + y * SIZE] = x < 16 ? SOURCE : x === 16 || y > 20 ? 0 : 8;
    const times = new Float32Array(SIZE * SIZE);
    solveArrival(depth, SIZE, TEXEL, SOURCE, times);
    expect(times[20]).toBe(0);
    const inside = times[20 + 10 * SIZE];
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThan(Infinity);
    // Nearer the edge it came in from is sooner.
    expect(times[20 + 5 * SIZE]).toBeLessThan(inside);
  });
});

// Makes land of the grid's edge right of x = 16, so the water there is a
// lagoon and not a bay open to the sea outside the grid.
function closeRight(depth: Float32Array): void {
  for (let k = 16; k < SIZE; k++) {
    depth[k] = 0;
    depth[k + (SIZE - 1) * SIZE] = 0;
  }
  for (let y = 0; y < SIZE; y++) depth[SIZE - 1 + y * SIZE] = 0;
}

function pack(depth: Float32Array): Uint16Array {
  const times = solve(depth);
  const reached = new Uint8Array(SIZE * SIZE);
  extendArrival(times, SIZE, TEXEL, reached);
  const out = new Uint16Array(SIZE * SIZE * 4);
  packShoreField(times, reached, SIZE, TEXEL, out);
  return out;
}

describe('packShoreField', () => {
  it('points the gradient to the shore and carries the times on past it', () => {
    const out = pack(beach());
    const at = (x: number, y: number, c: number) =>
      fromFloat16(out[(x + y * SIZE) * 4 + c]);

    expect(at(15, 16, 1)).toBeGreaterThan(0);
    expect(Math.abs(at(15, 16, 2))).toBeLessThan(1e-3);
    expect(at(15, 16, 3)).toBe(1);

    // Past the waterline the time keeps rising smoothly, with no strength.
    for (let x = 24; x < 28; x++) {
      expect(at(x, 16, 0)).toBeGreaterThan(at(x - 1, 16, 0));
      expect(at(x, 16, 0) - at(x - 1, 16, 0)).toBeLessThan(TEXEL);
      expect(at(x, 16, 3)).toBe(0);
    }
  });

  it('has no step in time at the edge of water the waves cannot reach', () => {
    const depth = new Float32Array(SIZE * SIZE).fill(10);
    for (let y = 0; y < SIZE; y++) depth[y * SIZE] = SOURCE;
    // A wall across the grid, with an enclosed lagoon behind it.
    for (let y = 0; y < SIZE; y++) depth[16 + y * SIZE] = 0;
    closeRight(depth);
    const out = pack(depth);
    const time = (x: number) => fromFloat16(out[(x + 8 * SIZE) * 4]);
    // One texel of 10 m water takes 8 / √(9.81 × 10) ≈ 0.8 s; one of the
    // carried-on times about 2.6 s. No jump is larger.
    for (let x = 1; x < SIZE; x++)
      expect(Math.abs(time(x) - time(x - 1))).toBeLessThan(3);
  });

  it('fades toward the edge', () => {
    const out = pack(beach());
    expect(fromFloat16(out[(10 + 0 * SIZE) * 4 + 3])).toBe(0);
    expect(fromFloat16(out[(10 + 16 * SIZE) * 4 + 3])).toBe(1);
  });
});

function packSwash(depth: Float32Array) {
  const times = solve(depth);
  const reached = new Uint8Array(SIZE * SIZE);
  extendArrival(times, SIZE, TEXEL, reached);
  const out = new Uint16Array(SIZE * SIZE * 2);
  packSwashField(
    times,
    reached,
    depth,
    SIZE,
    out,
    new Int8Array(SIZE * SIZE),
    new Int32Array(SIZE * SIZE)
  );
  return {
    time: (x: number, y: number) => fromFloat16(out[(x + y * SIZE) * 2]),
    reach: (x: number, y: number) => fromFloat16(out[(x + y * SIZE) * 2 + 1]),
    times,
  };
}

describe('packSwashField', () => {
  it('carries the waterline time a few texels up the beach', () => {
    const { time, reach, times } = packSwash(beach());
    const waterline = times[23 + 16 * SIZE];
    for (let x = 24; x < 24 + SWASH_REACH_TEXELS; x++) {
      expect(reach(x, 16)).toBe(1);
      expect(time(x, 16)).toBeCloseTo(waterline, 1);
    }
    expect(reach(24 + SWASH_REACH_TEXELS, 16)).toBe(0);
    expect(time(15, 16)).toBeCloseTo(times[15 + 16 * SIZE], 1);
  });

  it('stays out of water the waves cannot reach', () => {
    const depth = new Float32Array(SIZE * SIZE).fill(10);
    for (let y = 0; y < SIZE; y++) depth[y * SIZE] = SOURCE;
    // A bar one texel wide, with a lagoon behind it.
    for (let y = 0; y < SIZE; y++) depth[16 + y * SIZE] = 0;
    closeRight(depth);
    const { reach } = packSwash(depth);
    expect(reach(16, 8)).toBe(1);
    expect(reach(17, 8)).toBe(0);
  });
});

describe('collectShore', () => {
  function shore(depth: Float32Array) {
    const times = solve(depth);
    const reached = new Uint8Array(SIZE * SIZE);
    extendArrival(times, SIZE, TEXEL, reached);
    const xs = new Float32Array(SIZE * SIZE);
    const zs = new Float32Array(SIZE * SIZE);
    const strengths = new Float32Array(SIZE * SIZE);
    const count = collectShore(
      depth,
      reached,
      SIZE,
      TEXEL,
      100,
      200,
      xs,
      zs,
      strengths
    );
    return { count, xs, zs, strengths };
  }

  it('finds the last water before the beach on every row', () => {
    const { count, xs, zs } = shore(beach());
    expect(count).toBe(SIZE);
    for (let i = 0; i < count; i++) {
      expect(xs[i]).toBe(100 + 23 * TEXEL);
      expect(zs[i]).toBe(200 + i * TEXEL);
    }
  });

  it('fades the waves toward the edge of the grid', () => {
    const { strengths } = shore(beach());
    expect(strengths[SIZE / 2]).toBe(1);
    expect(strengths[0]).toBeLessThan(0.1);
  });

  it('skips the shore of water the waves cannot reach', () => {
    const depth = beach();
    // A pond inland, cut off from the sea.
    for (let y = 10; y < 13; y++)
      for (let x = 28; x < 31; x++) depth[x + y * SIZE] = 2;
    const { count, xs } = shore(depth);
    expect(count).toBe(SIZE);
    for (let i = 0; i < count; i++) expect(xs[i]).toBe(100 + 23 * TEXEL);
  });
});
