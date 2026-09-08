// The texture half of the suite, kept apart because it is the slow half.
//
// One buildCanvas costs about 50ms in node and roughly 1.2s under jest, whose
// module isolation stops V8 optimising the per-texel loops. These tests build
// sixteen of them, so they dominate the run however cheap everything else is.
// 128 is the smallest size the leaf grid still draws at, and nothing here
// asserts anything a larger atlas would say differently.

import { gutterFor } from './lib/atlas.ts';
import { parseArgs, resolveParams } from './lib/params.ts';
import { buildCanvas } from './lib/textures.ts';

const SIZE = '128';

function paramsFor(extra: string[] = []) {
  return resolveParams(parseArgs(['--name', 'test-tree', '--texture-size', SIZE, ...extra]));
}

/**
 * Compares two channels element by element.
 *
 * Never spread a channel to compare it. `[...canvas.albedo]` builds a two
 * hundred thousand element array, and handing two of those to `toEqual` once
 * turned a single test into two and a half minutes.
 */
function identical(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('texture template', () => {
  // Shared, because a canvas is the expensive thing here.
  const canvas = buildCanvas(paramsFor());

  it('leaves no fully transparent texel carrying coverage', () => {
    const bark = canvas.size * (canvas.size / 2);
    for (let i = 0; i < bark; i++) expect(canvas.alpha[i]).toBe(1);
  });

  it('cuts the leaf half out rather than filling it', () => {
    const half = canvas.size * (canvas.size / 2);
    let clear = 0;
    for (let i = half; i < canvas.size * canvas.size; i++) if (canvas.alpha[i] === 0) clear++;

    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(canvas.size * (canvas.size / 2));
  });

  it('dilates colour under the transparent texels', () => {
    // Left black, the mip chain averages the background into every leaf edge.
    const half = canvas.size * (canvas.size / 2);
    let litAndClear = 0;
    for (let i = half; i < canvas.size * canvas.size; i++)
      if (canvas.alpha[i] === 0 && canvas.albedo[i * 3 + 1] > 0) litAndClear++;

    expect(litAndClear).toBeGreaterThan(0);
  });

  /** Degrees between the warmest and coolest eighth of the bark half. */
  function patchHueRange(target: ReturnType<typeof buildCanvas>): number {
    const blockWidth = target.size / 4;
    const blockHeight = target.size / 4;
    const means: number[] = [];

    for (let by = 0; by < 2; by++)
      for (let bx = 0; bx < 4; bx++) {
        let sumX = 0;
        let sumY = 0;

        for (let y = by * blockHeight; y < (by + 1) * blockHeight; y++)
          for (let x = bx * blockWidth; x < (bx + 1) * blockWidth; x++) {
            const i = y * target.size + x;
            const [r, g, b] = [target.albedo[i * 3], target.albedo[i * 3 + 1], target.albedo[i * 3 + 2]];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min < 0.05 || max < 0.15) continue;

            const raw =
              max === r ? (g - b) / (max - min) : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
            const hue = ((((raw * 60) % 360) + 360) % 360) * (Math.PI / 180);
            sumX += Math.cos(hue);
            sumY += Math.sin(hue);
          }

        means.push((Math.atan2(sumY, sumX) * 180) / Math.PI);
      }

    return Math.max(...means) - Math.min(...means);
  }

  /** Share of the bark half the lichen has taken, by its green cast. */
  function lichenShare(target: ReturnType<typeof buildCanvas>): number {
    const bark = target.size * (target.size / 2);
    let covered = 0;
    for (let i = 0; i < bark; i++) if (target.albedo[i * 3 + 1] >= target.albedo[i * 3]) covered++;
    return covered / bark;
  }

  it('drifts colour in hue, not only in brightness', () => {
    // Measured patch to patch rather than over the whole half. A global spread
    // is dominated by the near-black fissures, whose hue is meaningless, and
    // stays flat however far the colour actually moves.
    const flat = buildCanvas(paramsFor(['--colour-variation', '0', '--lichen', '0']));
    const varied = buildCanvas(paramsFor(['--colour-variation', '0.35', '--lichen', '0']));

    expect(patchHueRange(varied)).toBeGreaterThan(patchHueRange(flat) * 1.5);
  });

  it('makes --lichen mean coverage across its whole range', () => {
    // An octave sum clusters around its mean and reaches neither bound, so a
    // threshold picked by eye lands outside the distribution and the flag
    // silently does nothing. It did exactly that once.
    const none = buildCanvas(paramsFor(['--lichen', '0']));
    const some = buildCanvas(paramsFor(['--lichen', '0.3']));
    const lots = buildCanvas(paramsFor(['--lichen', '1']));

    expect(lichenShare(none)).toBe(0);
    expect(lichenShare(some)).toBeGreaterThan(0.001);
    expect(lichenShare(lots)).toBeGreaterThan(lichenShare(some) * 3);
  });

  it('breaks roughness away from being a pure function of depth', () => {
    // Lichen off in both: it writes its own roughness, which would break the
    // "pure function of depth" the flat case is asserting.
    const flat = buildCanvas(paramsFor(['--roughness-variation', '0', '--lichen', '0']));
    const varied = buildCanvas(paramsFor(['--lichen', '0']));

    /** How completely roughness is predicted by height, 0 to 1. */
    const dependence = (target: ReturnType<typeof buildCanvas>): number => {
      const bark = target.size * (target.size / 2);
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      let n = 0;

      for (let i = 0; i < bark; i += 5) {
        const x = target.height[i];
        const y = target.roughness[i];
        sx += x;
        sy += y;
        sxx += x * x;
        syy += y * y;
        sxy += x * y;
        n++;
      }

      const cov = sxy / n - (sx / n) * (sy / n);
      const sdx = Math.sqrt(sxx / n - (sx / n) ** 2);
      const sdy = Math.sqrt(syy / n - (sy / n) ** 2);
      return Math.abs(cov / (sdx * sdy));
    };

    // Without variation the two are the same number scaled, so the whole
    // surface catches light identically as the viewer moves across it.
    expect(dependence(flat)).toBeCloseTo(1, 5);
    expect(dependence(varied)).toBeLessThan(0.5);
  });

  it('tunes the grooves in depth and in darkness separately', () => {
    const bark = (target: ReturnType<typeof buildCanvas>) => target.size * (target.size / 2);
    const floorOf = (target: ReturnType<typeof buildCanvas>): number => {
      let lowest = 1;
      for (let i = 0; i < bark(target); i++) lowest = Math.min(lowest, target.height[i]);
      return lowest;
    };
    const darkestOf = (target: ReturnType<typeof buildCanvas>): number => {
      let darkest = 1;
      for (let i = 0; i < bark(target); i++) darkest = Math.min(darkest, target.albedo[i * 3]);
      return darkest;
    };

    const joined = buildCanvas(paramsFor(['--groove-depth', '0', '--lichen', '0']));
    const cut = buildCanvas(paramsFor(['--groove-depth', '0.4', '--lichen', '0']));
    const pale = buildCanvas(
      paramsFor(['--groove-depth', '0.4', '--groove-shade', '0.85', '--lichen', '0'])
    );

    expect(floorOf(cut)).toBeLessThan(floorOf(joined));

    // Depth and darkness are separable on purpose: a groove can be deep enough
    // to catch a shadow without bottoming out as a black line.
    expect(darkestOf(pale)).toBeGreaterThan(darkestOf(cut));
    expect(floorOf(pale)).toBeCloseTo(floorOf(cut), 5);
  });

  it('closes the bark ring at every colour patch scale', () => {
    // v maps once around the trunk, so the first row of the band and the row
    // one past its last are the same place on the tube. The lattice wraps on
    // whole cells, so a fractional period would put a seam down every trunk in
    // the world. Height rather than colour, because the curvature pass reads
    // neighbours and those differ between the two rows.
    for (const patches of ['2', '5', '13']) {
      const target = buildCanvas(paramsFor(['--colour-patches', patches]));
      const gutter = gutterFor(target.size);
      const half = target.size / 2;

      for (let x = 0; x < target.size; x += 7)
        expect(target.height[gutter * target.size + x]).toBe(target.height[(half - gutter) * target.size + x]);
    }
  });

  it('scales the colour patches with --colour-patches', () => {
    // Measured as how fast colour changes across the band. Broad blotches vary
    // slowly, fine mottling varies quickly.
    const churn = (target: ReturnType<typeof buildCanvas>): number => {
      let total = 0;
      let n = 0;
      for (let y = 4; y < target.size / 2 - 4; y += 3)
        for (let x = 0; x < target.size - 1; x += 3) {
          const a = (y * target.size + x) * 3;
          const b = (y * target.size + x + 1) * 3;
          total += Math.abs(target.albedo[a] - target.albedo[b]) + Math.abs(target.albedo[a + 2] - target.albedo[b + 2]);
          n++;
        }
      return total / n;
    };

    const broad = buildCanvas(paramsFor(['--colour-patches', '2', '--colour-variation', '0.4']));
    const fine = buildCanvas(paramsFor(['--colour-patches', '20', '--colour-variation', '0.4']));

    expect(churn(fine)).toBeGreaterThan(churn(broad));
  });

  it('grows knots without tearing the bark around them', () => {
    const smooth = buildCanvas(paramsFor(['--knots', '0']));
    const knotted = buildCanvas(paramsFor(['--knots', '1']));

    /** The largest step between two side by side texels of the bark. */
    const worstStep = (target: ReturnType<typeof buildCanvas>): number => {
      let worst = 0;
      for (let y = 2; y < target.size / 2 - 2; y++)
        for (let x = 0; x < target.size; x++) {
          const a = target.height[y * target.size + x];
          const b = target.height[y * target.size + ((x + 1) % target.size)];
          worst = Math.max(worst, Math.abs(a - b));
        }
      return worst;
    };

    expect(identical(knotted.height, smooth.height)).toBe(false);

    // A knot displaces the coordinate every other bark lookup reads at. Taking
    // that displacement from the nearest knot makes it jump wherever the winner
    // changes, and the jump draws a hard straight line clean across the trunk —
    // far more obvious than the knots themselves. Accumulating every knot in
    // range is what keeps it continuous. The floor is the fissures, which are
    // meant to be sharp.
    expect(worstStep(knotted)).toBeLessThan(worstStep(smooth) * 1.5);
  });

  it('closes the bark ring with knots at full density', () => {
    const target = buildCanvas(paramsFor(['--knots', '1']));
    const gutter = gutterFor(target.size);
    const half = target.size / 2;

    for (let x = 0; x < target.size; x += 5)
      expect(target.height[gutter * target.size + x]).toBe(target.height[(half - gutter) * target.size + x]);
  });

  it('shades curvature without moving the height it read', () => {
    const flat = buildCanvas(paramsFor(['--curvature', '0']));

    expect(identical(canvas.height, flat.height)).toBe(true);
    expect(identical(canvas.albedo, flat.albedo)).toBe(false);
  });
});
