import {
  createWaterQuerySample,
  WaterQuerySample,
} from 'rewild-renderer/lib/renderers/water/WaterQuery';
import { findLapping, LapPoint, WaterSampler } from './lakeShore';

const LAPPING = [0, 1];

/** Water west of x = 0, of type weights `weights`, at level 5. */
function westWater(weights: number[], loadedTo = Infinity): WaterSampler {
  return (x, z, out) => {
    if (Math.abs(x) > loadedTo) return false;
    out.wet = x < 0;
    out.level = out.wet ? 5 : -Infinity;
    out.typeWeights.fill(0);
    if (out.wet) weights.forEach((w, i) => (out.typeWeights[i] = w));
    return true;
  };
}

let scratch: WaterQuerySample;
let out: LapPoint;

beforeEach(() => {
  scratch = createWaterQuerySample();
  out = { x: 0, y: 0, z: 0, distance: 0, lapping: 0 };
});

describe('findLapping', () => {
  it('finds the shoreline of a lake from the land', () => {
    expect(findLapping(westWater([0, 1]), 10, 0, LAPPING, scratch, out)).toBe(
      true
    );
    expect(out.x).toBeCloseTo(0, 0);
    expect(out.z).toBeCloseTo(0, 0);
    expect(out.y).toBe(5);
    expect(out.distance).toBeCloseTo(10, 0);
    expect(out.lapping).toBe(1);
  });

  it('finds the shoreline from out on the water', () => {
    expect(findLapping(westWater([0, 1]), -6, 0, LAPPING, scratch, out)).toBe(
      true
    );
    expect(out.x).toBeCloseTo(0, 0);
    expect(out.distance).toBeCloseTo(6, 0);
    expect(out.y).toBe(5);
  });

  it('finds no lapping on the ocean', () => {
    expect(findLapping(westWater([1, 0]), 10, 0, LAPPING, scratch, out)).toBe(
      false
    );
  });

  it('laps a lagoon by its share of lake', () => {
    findLapping(westWater([0.6, 0.4]), 10, 0, LAPPING, scratch, out);
    expect(out.lapping).toBeCloseTo(0.4, 6);
  });

  it('finds nothing out of reach', () => {
    expect(findLapping(westWater([0, 1]), 100, 0, LAPPING, scratch, out)).toBe(
      false
    );
  });

  it('takes no shoreline from ground that is not loaded', () => {
    expect(
      findLapping(westWater([0, 1], 12), 10, 0, LAPPING, scratch, out)
    ).toBe(true);
    expect(
      findLapping(westWater([0, 1], 5), 10, 0, LAPPING, scratch, out)
    ).toBe(false);
  });
});
