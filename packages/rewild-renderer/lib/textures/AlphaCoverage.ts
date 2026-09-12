// Alpha-tested textures thin out down the mip chain: averaging a leaf against
// the gap beside it drives the texel below the cutoff, so a card that covers
// half its texels at the base level covers none of them a few mips down. The
// fix is to test each mip against a cutoff scaled so the same fraction of
// texels pass as at the base level. That fraction is a property of the
// texture, so the histograms are taken once at load; the scales are a
// property of the cutoff, so a material derives its own from them.

export const ALPHA_HISTOGRAM_BINS = 256;

/** How many mips a material carries scales for — StandardParams.alphaMipScale. */
export const ALPHA_MIP_SCALE_COUNT = 16;

/**
 * One histogram of alpha per mip level, the base level first, or null when
 * every texel is opaque and no test can thin it.
 */
export function alphaMipHistograms(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint32Array[] | null {
  let translucent = false;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < 255) {
      translucent = true;
      break;
    }
  }
  if (!translucent) return null;

  const histograms: Uint32Array[] = [histogram(alpha)];
  let level = alpha;
  let w = width;
  let h = height;

  // The same box filter the mip generator applies, level by level.
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const next = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.min(h - 1, y * 2);
      const y1 = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < nw; x++) {
        const x0 = Math.min(w - 1, x * 2);
        const x1 = Math.min(w - 1, x * 2 + 1);
        next[y * nw + x] =
          (level[y0 * w + x0] +
            level[y0 * w + x1] +
            level[y1 * w + x0] +
            level[y1 * w + x1] +
            2) >>
          2;
      }
    }
    histograms.push(histogram(next));
    level = next;
    w = nw;
    h = nh;
  }

  return histograms;
}

function histogram(alpha: Uint8Array | Uint8ClampedArray): Uint32Array {
  const bins = new Uint32Array(ALPHA_HISTOGRAM_BINS);
  for (let i = 0; i < alpha.length; i++) bins[alpha[i]]++;
  return bins;
}

/**
 * The factor each mip's alpha is multiplied by before the cutoff test so the
 * fraction of texels that pass matches the base level's. Never below 1: a mip
 * can only have lost coverage. One entry per mip the material carries; a
 * texture with fewer mips repeats its last.
 */
export function alphaMipScales(
  histograms: Uint32Array[],
  cutoff: number
): Float32Array {
  const scales = new Float32Array(ALPHA_MIP_SCALE_COUNT).fill(1);
  const threshold = Math.min(255, Math.max(0, Math.round(cutoff * 255)));
  const coverage = fractionAtOrAbove(histograms[0], threshold);

  for (let m = 0; m < ALPHA_MIP_SCALE_COUNT; m++) {
    const bins = histograms[Math.min(m, histograms.length - 1)];
    // The alpha at which this mip's coverage equals the base level's, and so
    // the value the cutoff should land on once scaled.
    const quantile = alphaAtCoverage(bins, coverage);
    scales[m] = Math.max(1, threshold / Math.max(1, quantile));
  }

  return scales;
}

function fractionAtOrAbove(bins: Uint32Array, threshold: number): number {
  let total = 0;
  let above = 0;
  for (let b = 0; b < bins.length; b++) {
    total += bins[b];
    if (b >= threshold) above += bins[b];
  }
  return total === 0 ? 0 : above / total;
}

/** The highest alpha at which at least `coverage` of the texels are at or
 *  above it. */
function alphaAtCoverage(bins: Uint32Array, coverage: number): number {
  let total = 0;
  for (let b = 0; b < bins.length; b++) total += bins[b];
  const wanted = coverage * total;

  let above = 0;
  for (let b = bins.length - 1; b >= 0; b--) {
    above += bins[b];
    if (above >= wanted) return b;
  }
  return 0;
}

/**
 * Reads the alpha channel out of a decoded image. Returns null for an image
 * with no translucent texel, which is most of them, so the histograms are
 * only built where an alpha test could ever thin something.
 */
export function imageAlphaHistograms(
  image: ImageBitmap | HTMLImageElement
): Uint32Array[] | null {
  const { width, height } = image;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];

  return alphaMipHistograms(alpha, width, height);
}
