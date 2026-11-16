import { canvasPixelSize } from './canvasSize';

describe('canvasPixelSize', () => {
  it('keeps the CSS size at a ratio of 1', () => {
    expect(canvasPixelSize(300, 200, 1)).toEqual({ width: 300, height: 200 });
  });

  it('scales by the pixel ratio', () => {
    expect(canvasPixelSize(300, 200, 2)).toEqual({ width: 600, height: 400 });
  });

  it('rounds fractional sizes', () => {
    expect(canvasPixelSize(100.4, 50.6, 1.5)).toEqual({
      width: 151,
      height: 76,
    });
  });

  it('is never smaller than one pixel', () => {
    expect(canvasPixelSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});
