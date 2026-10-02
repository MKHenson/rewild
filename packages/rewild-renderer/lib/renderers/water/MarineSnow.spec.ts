import { snowPlace } from './MarineSnow';

describe('MarineSnow', () => {
  it('wraps the specks into 0..1 of the box', () => {
    const out = new Float32Array(3);
    snowPlace([25, -7, 1000.5], [0, 0, 0], 12, out);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('leaves a speck where it is in the world as the camera moves', () => {
    const box = 12;
    const before = new Float32Array(3);
    const after = new Float32Array(3);
    snowPlace([10, 0, 0], [0, 0, 0], box, before);
    snowPlace([13, 0, 0], [0, 0, 0], box, after);
    // A speck at seed s sits at camera + (fract(s + place + 0.5) - 0.5) * box.
    const seed = 0.3;
    const at = (eye: number, place: number) =>
      eye + (((seed + place + 0.5) % 1) - 0.5) * box;
    expect(at(13, after[0])).toBeCloseTo(at(10, before[0]), 4);
  });

  it('moves the specks with the current', () => {
    const still = new Float32Array(3);
    const carried = new Float32Array(3);
    snowPlace([0, 0, 0], [0, 0, 0], 12, still);
    snowPlace([0, 0, 0], [0, 0, 3], 12, carried);
    expect(carried[2] - still[2]).toBeCloseTo(0.25, 5);
  });
});
