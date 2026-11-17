import { hexColor, packColor, parseColor } from './color';

describe('parseColor', () => {
  it('parses #rrggbb', () => {
    expect(parseColor('#ff0033')).toEqual([1, 0, 0.2, 1]);
  });

  it('parses #rrggbbaa', () => {
    expect(parseColor('#00000080')[3]).toBeCloseTo(128 / 255);
  });

  it('parses the short forms', () => {
    expect(parseColor('#f03')).toEqual([1, 0, 0.2, 1]);
    expect(parseColor('#0000')).toEqual([0, 0, 0, 0]);
  });

  it('gives transparent for a missing or bad colour', () => {
    expect(parseColor(undefined)).toEqual([0, 0, 0, 0]);
    expect(parseColor('#xyz')).toEqual([0, 0, 0, 0]);
  });
});

describe('hexColor', () => {
  it('writes channels as #rrggbb', () => {
    expect(hexColor(1, 0.2, 0)).toBe('#ff3300');
  });

  it('clamps channels to 0 and 1', () => {
    expect(hexColor(2, -1, 0.5)).toBe('#ff0080');
  });
});

describe('packColor', () => {
  it('packs red, green and blue into one number', () => {
    expect(packColor(parseColor('#123456'))).toBe(0x123456);
  });

  it('survives a float32 round trip', () => {
    const packed = packColor(parseColor('#ffffff'));
    expect(new Float32Array([packed])[0]).toBe(packed);
  });
});
