import {
  DEFAULT_SPRAY,
  UNKNOWN_GROUND,
  seaDepthAt,
  sprayShapeAt,
} from './SeaSpray';

describe('SeaSpray', () => {
  it('takes the moderate shape up to windiness 0.7 and the storm shape at 1', () => {
    expect(sprayShapeAt(DEFAULT_SPRAY, 0.5)).toEqual(DEFAULT_SPRAY.moderate);
    expect(sprayShapeAt(DEFAULT_SPRAY, 0.7)).toEqual(DEFAULT_SPRAY.moderate);
    expect(sprayShapeAt(DEFAULT_SPRAY, 1)).toEqual(DEFAULT_SPRAY.storm);
    const half = sprayShapeAt(DEFAULT_SPRAY, 0.85);
    expect(half.size).toBeCloseTo(
      (DEFAULT_SPRAY.moderate.size + DEFAULT_SPRAY.storm.size) / 2,
      9
    );
  });

  it('measures the sea from the sea level, none on land, unknown unloaded', () => {
    expect(seaDepthAt(0, -12)).toBe(12);
    expect(seaDepthAt(0, 3)).toBe(0);
    expect(seaDepthAt(0, null)).toBe(UNKNOWN_GROUND);
  });
});
