import { alphaMipHistograms, alphaMipScales } from './AlphaCoverage';

// A 4x4 checker: half the texels opaque, half clear. Every mip below the base
// averages to 128 everywhere — the texture an alpha test erodes to nothing.
function checker(): Uint8Array {
  const alpha = new Uint8Array(16);
  for (let i = 0; i < 16; i++)
    alpha[i] = ((i % 4) + Math.floor(i / 4)) % 2 ? 255 : 0;
  return alpha;
}

describe('alphaMipHistograms', () => {
  it('is null for an opaque image', () => {
    expect(alphaMipHistograms(new Uint8Array(16).fill(255), 4, 4)).toBeNull();
  });

  it('box-filters the alpha down to one texel', () => {
    const histograms = alphaMipHistograms(checker(), 4, 4)!;
    expect(histograms.length).toBe(3);
    expect(histograms[0][255]).toBe(8);
    expect(histograms[0][0]).toBe(8);
    expect(histograms[1][128]).toBe(4);
    expect(histograms[2][128]).toBe(1);
  });
});

describe('alphaMipScales', () => {
  it('lifts an averaged mip back to the base coverage', () => {
    const scales = alphaMipScales(alphaMipHistograms(checker(), 4, 4)!, 0.5);
    expect(scales[0]).toBe(1);
    // Half the base passes at 128. A mip that is 128 everywhere passes whole
    // at scale 1, which is the nearest a flat mip can get.
    expect(scales[1]).toBeCloseTo(1);
    // Under a cutoff of 0.9 nothing in the flat mip would pass; the scale
    // brings 128 up to it.
    const strict = alphaMipScales(alphaMipHistograms(checker(), 4, 4)!, 0.9);
    expect(strict[1]).toBeCloseTo(230 / 128, 2);
  });

  it('never scales below 1', () => {
    const alpha = new Uint8Array(16).fill(255);
    alpha[0] = 0;
    const scales = alphaMipScales(alphaMipHistograms(alpha, 4, 4)!, 0.1);
    for (const scale of scales) expect(scale).toBeGreaterThanOrEqual(1);
  });
});
