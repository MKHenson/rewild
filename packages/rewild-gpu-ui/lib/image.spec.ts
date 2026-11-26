import { cropUv, fitImage } from './image';

const box = { x: 10, y: 20, width: 200, height: 100 };

describe('fitImage', () => {
  it('stretches the image over the box with fill', () => {
    expect(fitImage(box, 50, 50, 'fill')).toEqual({
      rect: box,
      crop: [0, 0, 1, 1],
    });
  });

  it('fits the whole image in the box, centred, with contain', () => {
    // A square in a wide box: as tall as the box, centred across it.
    expect(fitImage(box, 50, 50, 'contain')).toEqual({
      rect: { x: 60, y: 20, width: 100, height: 100 },
      crop: [0, 0, 1, 1],
    });
    // A wide image in a wide box: as wide as the box.
    expect(fitImage(box, 400, 100, 'contain')).toEqual({
      rect: { x: 10, y: 45, width: 200, height: 50 },
      crop: [0, 0, 1, 1],
    });
  });

  it('fills the box and crops the centre of the image with cover', () => {
    // A square in a wide box: as wide as the box, with its top and bottom quarters cut.
    expect(fitImage(box, 50, 50, 'cover')).toEqual({
      rect: box,
      crop: [0, 0.25, 1, 0.75],
    });
    // A tall image in a wide box: 200 by 800, so the middle 100 rows show.
    const fitted = fitImage(box, 100, 400, 'cover')!;
    expect(fitted.rect).toEqual(box);
    expect(fitted.crop[0]).toBe(0);
    expect(fitted.crop[2]).toBe(1);
    expect(fitted.crop[1]).toBeCloseTo(0.4375);
    expect(fitted.crop[3]).toBeCloseTo(0.5625);
  });

  it('shows nothing in an empty box or for an empty image', () => {
    expect(fitImage({ ...box, width: 0 }, 50, 50, 'contain')).toBeNull();
    expect(fitImage(box, 0, 50, 'cover')).toBeNull();
  });
});

describe('cropUv', () => {
  it('maps a crop into the image cell of its texture', () => {
    expect(cropUv([0.5, 0, 0.75, 0.5], [0, 0.25, 1, 0.75])).toEqual([
      0.5, 0.125, 0.75, 0.375,
    ]);
  });
});
