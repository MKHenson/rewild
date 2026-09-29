import { LAKE, OCEAN } from '../terrain/Water';
import { CASCADE_COUNT, CASCADE_SIZES } from './OceanSpectrum';
import { SHORE_OMEGAS } from './ShoreWaves';
import { WAVE_UNIFORM_FLOATS, WaterWaves, WaveFrame } from './WaterWaves';

const PALETTE = [OCEAN, LAKE];

function frame(overrides: Partial<WaveFrame> = {}): WaveFrame {
  return {
    detailBias: 0.5,
    normals: true,
    foamDebug: false,
    shoreDebug: false,
    crestGlow: 1.5,
    troughDarkening: 0.5,
    eyeX: 0,
    eyeZ: 0,
    finestSpacing: 2,
    lodDistances: [],
    lodSpacings: [],
    windSpeed: 7,
    cascadeRms: [2, 0.5, 0.1, 0.02],
    time: 3,
    shoreHeight: 1.5,
    shoreCentreX: -19200,
    shoreCentreZ: 26880,
    shoreSpan: 2048,
    ...overrides,
  };
}

describe('WaterWaves', () => {
  it('gives the ocean every cascade and a lake all but the longest', () => {
    const waves = new WaterWaves();
    waves.update(PALETTE);
    for (let c = 0; c < CASCADE_COUNT; c++)
      expect(waves.cascadeTypes[c * 4]).toBeCloseTo(OCEAN.waveResponse, 6);
    expect(waves.cascadeTypes[0 * 4 + 1]).toBe(0);
    expect(waves.cascadeTypes[1 * 4 + 1]).toBeCloseTo(LAKE.waveResponse, 6);
    expect(waves.cascadeTypes[3 * 4 + 1]).toBeCloseTo(LAKE.waveResponse, 6);
    expect(waves.cascadeTypes[2]).toBe(0);
  });

  it('packs the Waves uniform', () => {
    const waves = new WaterWaves();
    waves.update(PALETTE);
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
    // Seven vec4 of header, two arrays of four vec4, then two of the shore.
    expect(out.byteLength).toBe(112 + 64 + 64 + 32);
    expect(out[60]).toBeCloseTo(SHORE_OMEGAS[0], 6);
    expect(out[62]).toBeCloseTo(SHORE_OMEGAS[0] * 3, 5);
    expect(Array.from(out.subarray(64, 68))).toEqual([1.5, 256, 256, 2048]);
    expect(Array.from(out.subarray(0, 4))).toEqual([0.5, 0, 56, 76]);
    expect(Array.from(out.subarray(4, 7))).toEqual([-19456, 26624, 7]);
    expect(Array.from(out.subarray(8, 11))).toEqual([200, 400, 0]);
    expect(Array.from(out.subarray(16, 19))).toEqual([4, 8, 0]);
    expect(Array.from(out.subarray(24, 27))).toEqual([2, 1.5, 0.5]);
    for (let c = 0; c < CASCADE_COUNT; c++) {
      const size = CASCADE_SIZES[c];
      expect(out[28 + c * 4]).toBe(Math.fround(size));
      expect(out[28 + c * 4 + 1]).toBe(Math.fround([2, 0.5, 0.1, 0.02][c]));
      // The origin's place in the tile: rest / size + it is world / size.
      const place = out[28 + c * 4 + 2];
      expect(place).toBeGreaterThanOrEqual(0);
      expect(place).toBeLessThan(1);
      const world = -19456 / size;
      expect(Math.abs(place - (world - Math.floor(world)))).toBeLessThan(1e-5);
      expect(out[44 + c * 4]).toBe(Math.fround(waves.cascadeTypes[c * 4]));
    }
  });
});
