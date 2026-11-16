import { parseComputedColor } from './cssColor';

describe('parseComputedColor', () => {
  it('parses rgb', () => {
    expect(parseComputedColor('rgb(255, 0, 51)')).toEqual({
      r: 1,
      g: 0,
      b: 0.2,
      a: 1,
    });
  });

  it('parses rgba', () => {
    expect(parseComputedColor('rgba(0, 0, 0, 0.5)').a).toBe(0.5);
  });

  it('parses the space separated form', () => {
    expect(parseComputedColor('rgb(0 0 0 / 25%)').a).toBe(0.25);
  });

  it('gives transparent black for an unknown value', () => {
    expect(parseComputedColor('transparent')).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });
});
