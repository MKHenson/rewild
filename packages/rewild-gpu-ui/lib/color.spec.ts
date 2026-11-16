import { parseColor } from './color';

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
