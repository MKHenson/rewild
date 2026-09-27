import { LAKE, OCEAN } from '../../renderers/terrain/Water';
import { packWaterParams } from './WaterUniforms';

describe('packWaterParams', () => {
  const packed = packWaterParams([OCEAN, LAKE], 61, {
    originX: 480,
    originZ: -960,
    baseLevel: 12.5,
  });

  it('matches the WaterParams struct size', () => {
    // 16-byte header, two arrays of four vec4f, then the base level padded to 16.
    expect(packed.byteLength).toBe(16 + 64 + 64 + 16);
  });

  it('writes the grid placement', () => {
    expect(packed[2]).toBe(480);
    expect(packed[3]).toBe(-960);
    expect(packed[36]).toBe(12.5);
  });

  it('writes the texel count and a calm roughness', () => {
    expect(packed[0]).toBe(61);
    expect(packed[1]).toBeGreaterThanOrEqual(0.045);
  });

  it('packs scatter, absorption and turbidity per palette slot', () => {
    for (const [slot, type] of [OCEAN, LAKE].entries()) {
      const s = 4 + slot * 4;
      const e = 20 + slot * 4;
      expect(Array.from(packed.subarray(s, s + 3))).toEqual(
        type.scatter.map(Math.fround)
      );
      expect(Array.from(packed.subarray(e, e + 3))).toEqual(
        type.absorption.map(Math.fround)
      );
      expect(packed[e + 3]).toBe(Math.fround(type.turbidity));
    }
  });

  it('leaves unused slots empty', () => {
    expect(Array.from(packed.subarray(12, 20))).toEqual(new Array(8).fill(0));
    expect(Array.from(packed.subarray(28, 36))).toEqual(new Array(8).fill(0));
  });
});
