import { LAKE, OCEAN } from '../terrain/Water';
import { CASCADE_COUNT, CASCADE_SIZES } from './OceanSpectrum';
import {
  CHOP_FIELD,
  FOAM_DRIFT_PERIOD,
  SWELL_FIELD,
  VARIATION_RANGES,
  WAVE_UNIFORM_FLOATS,
  WaterWaves,
  WaveFrame,
} from './WaterWaves';

const PALETTE = [OCEAN, LAKE];

function run(waves: WaterWaves, seconds: number, x = 1, z = 0, windiness = 1) {
  for (let t = 0; t < seconds; t += 0.1) waves.update(0.1, x, z, windiness, PALETTE);
}

function frame(overrides: Partial<WaveFrame> = {}): WaveFrame {
  return {
    detailBias: 0.5,
    normals: true,
    foamDebug: false,
    eyeX: 0,
    eyeZ: 0,
    finestSpacing: 2,
    lodDistances: [],
    lodSpacings: [],
    wind: [1, 0, 0.5, 12],
    windSpeed: 7,
    ...overrides,
  };
}

describe('WaterWaves', () => {
  it('varies the swell and the chop over space, each across its range', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    const swell: number[] = [];
    const chop: number[] = [];
    for (let x = 0; x < 20000; x += 53) {
      swell.push(waves.variation(x, 1234, SWELL_FIELD));
      chop.push(waves.variation(x, 1234, CHOP_FIELD));
    }
    for (const [field, samples] of [swell, chop].entries()) {
      const [low, high] = VARIATION_RANGES[field];
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(low);
      expect(Math.max(...samples)).toBeLessThanOrEqual(high);
      expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan((high - low) * 0.7);
    }
  });

  it('drifts the variation downwind', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    const before = waves.variationOffset[0];
    run(waves, 10);
    expect(waves.variationOffset[0]).not.toBeCloseTo(before, 6);
  });

  it('drifts the foam downwind with the wind, wrapped', () => {
    const waves = new WaterWaves();
    waves.update(10, 0, 1, 0, PALETTE);
    expect(Array.from(waves.foamOffset)).toEqual([0, 0]);
    waves.update(10, 0, 1, 1, PALETTE);
    expect(waves.foamOffset[1]).toBeCloseTo(15, 9);
    waves.update(10, 0, -1, 1, PALETTE);
    waves.update(10, 0, -1, 1, PALETTE);
    expect(waves.foamOffset[1]).toBeCloseTo(FOAM_DRIFT_PERIOD - 15, 6);
  });

  it('gives the ocean every cascade and a lake only the short ones', () => {
    const waves = new WaterWaves();
    run(waves, 0.1);
    for (let c = 0; c < CASCADE_COUNT; c++)
      expect(waves.cascadeTypes[c * 4]).toBeCloseTo(OCEAN.waveResponse, 6);
    expect(waves.cascadeTypes[0 * 4 + 1]).toBe(0);
    expect(waves.cascadeTypes[1 * 4 + 1]).toBeLessThan(0.01);
    expect(waves.cascadeTypes[3 * 4 + 1]).toBeCloseTo(LAKE.waveResponse, 6);
    expect(waves.cascadeTypes[2]).toBe(0);
  });

  it('packs the Waves uniform', () => {
    const waves = new WaterWaves();
    run(waves, 1);
    waves.setOrigin(-19642, 26737);
    expect(waves.originX).toBe(-19456);
    expect(waves.originZ).toBe(26624);

    const out = new Float32Array(WAVE_UNIFORM_FLOATS);
    waves.pack(
      frame({
        eyeX: -19400,
        eyeZ: 26700,
        lodDistances: [200, 400],
        lodSpacings: [4, 8],
        normals: false,
      }),
      out
    );
    // Ten vec4 of header, then two arrays of four vec4.
    expect(out.byteLength).toBe(160 + 64 + 64);
    expect(Array.from(out.subarray(0, 4))).toEqual([0.5, 0, 56, 76]);
    expect(Array.from(out.subarray(4, 7))).toEqual([-19456, 26624, 7]);
    expect(out[8]).toBe(Math.fround(waves.variationOffset[0]));
    expect(Array.from(out.subarray(16, 20))).toEqual([1, 0, 0.5, 12]);
    expect(Array.from(out.subarray(20, 23))).toEqual([200, 400, 0]);
    expect(Array.from(out.subarray(28, 31))).toEqual([4, 8, 0]);
    expect(out[36]).toBe(2);
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const size = CASCADE_SIZES[c];
      expect(out[40 + c * 4]).toBe(Math.fround(size));
      // The origin's place in the tile: rest / size + it is world / size.
      const place = out[40 + c * 4 + 2];
      expect(place).toBeGreaterThanOrEqual(0);
      expect(place).toBeLessThan(1);
      const world = -19456 / size;
      expect(Math.abs(place - (world - Math.floor(world)))).toBeLessThan(1e-5);
      expect(out[56 + c * 4]).toBe(Math.fround(waves.cascadeTypes[c * 4]));
    }
  });
});
