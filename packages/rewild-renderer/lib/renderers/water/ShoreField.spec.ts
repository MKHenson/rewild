import { fromFloat16 } from '../../utils/float16';
import {
  SWASH_REACH_TEXELS,
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
});

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
    const { reach } = packSwash(depth);
    expect(reach(16, 8)).toBe(1);
    expect(reach(17, 8)).toBe(0);
  });
});
