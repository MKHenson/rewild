import { fromFloat16, toFloat16 } from './float16';

describe('float16', () => {
  it.each([0, 1, -1, 0.5, 2, 1024, 65504, -65504, 2 ** -14, 2 ** -24])(
    'round-trips %p exactly',
    (value) => {
      expect(fromFloat16(toFloat16(value))).toBe(value);
    }
  );

  it('encodes known bit patterns', () => {
    expect(toFloat16(1)).toBe(0x3c00);
    expect(toFloat16(-2)).toBe(0xc000);
    expect(toFloat16(65504)).toBe(0x7bff);
    expect(toFloat16(2 ** -24)).toBe(0x0001);
  });

  it('keeps the relative error within half a unit in the last place', () => {
    for (let v = -600; v <= 600; v += 0.37) {
      const back = fromFloat16(toFloat16(v));
      const ulp = 2 ** (Math.floor(Math.log2(Math.max(Math.abs(v), 2 ** -14))) - 10);
      // Slack for the f32 step the conversion goes through.
      expect(Math.abs(back - v)).toBeLessThanOrEqual(ulp / 2 + 1e-6);
    }
  });

  it('rounds to nearest even at the midpoint', () => {
    expect(fromFloat16(toFloat16(1 + 2 ** -11))).toBe(1);
    expect(fromFloat16(toFloat16(1 + 3 * 2 ** -11))).toBe(1 + 2 ** -9);
  });

  it('saturates to infinity and flushes tiny values to zero', () => {
    expect(fromFloat16(toFloat16(1e6))).toBe(Infinity);
    expect(fromFloat16(toFloat16(-1e6))).toBe(-Infinity);
    expect(fromFloat16(toFloat16(1e-9))).toBe(0);
    expect(Number.isNaN(fromFloat16(toFloat16(NaN)))).toBe(true);
  });
});
