import {
  CAUSTICS_PARAMS_FLOATS,
  CAUSTIC_CASCADE,
  CAUSTIC_MAX_SHIFT,
  DEFAULT_CAUSTICS,
  causticMargin,
  packCausticsParams,
} from './Caustics';
import { CASCADE_SIZES, FFT_SIZE } from './OceanSpectrum';
import { refractedSunCosine } from './UnderWater';

const TILE = CASCADE_SIZES[CAUSTIC_CASCADE];

function pack(
  eyeX: number,
  eyeZ: number,
  toSun: number[],
  weight = 1,
  settings = DEFAULT_CAUSTICS
) {
  const out = new Float32Array(CAUSTICS_PARAMS_FLOATS);
  const strength = packCausticsParams(out, settings, eyeX, eyeZ, toSun, weight);
  return { out, strength };
}

describe('Caustics', () => {
  it('places the camera in the tile anchored at the world origin', () => {
    const { out } = pack(
      TILE * 3 + 0.25 * TILE,
      -TILE * 2 + 0.75 * TILE,
      [0, 1, 0]
    );
    expect(out[0]).toBeCloseTo(0.25, 5);
    expect(out[1]).toBeCloseTo(0.75, 5);
    expect(out[2]).toBeCloseTo(1 / TILE, 6);
  });

  it('traces a point back along the refracted sun to where its light entered', () => {
    const toSun = [0.6, 0.8, 0];
    const { out } = pack(0, 0, toSun);
    const mu = refractedSunCosine(0.8);
    // Refracted, the sun is steeper than in the air.
    expect(Math.abs(out[4])).toBeLessThan(0.6 / 0.8);
    expect(out[4]).toBeCloseTo((0.6 * 0.75) / mu, 5);
    expect(out[5]).toBe(0);
  });

  it('is off while the sun is down and fades in as it rises', () => {
    expect(pack(0, 0, [1, 0, 0]).strength).toBe(0);
    expect(pack(0, 0, [0.99, -0.1, 0]).strength).toBe(0);
    const low = pack(0, 0, [0.998, 0.05, 0]).strength;
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(DEFAULT_CAUSTICS.strength);
    expect(pack(0, 0, [0, 1, 0]).strength).toBe(DEFAULT_CAUSTICS.strength);
  });

  it('keeps the deep plane below the shallow one', () => {
    const { out } = pack(0, 0, [0, 1, 0], 1, {
      strength: 1,
      shallow: 4,
      deep: 2,
    });
    expect(out[7]).toBeGreaterThan(out[6]);
  });

  it('carries the water at the camera', () => {
    expect(pack(0, 0, [0, 1, 0], 0.4).out[8]).toBeCloseTo(0.4, 6);
  });

  it('reaches past the tile by more than a ray can land from its entry', () => {
    const margin = causticMargin(TILE);
    expect((margin / FFT_SIZE) * TILE).toBeGreaterThan(CAUSTIC_MAX_SHIFT);
  });
});
