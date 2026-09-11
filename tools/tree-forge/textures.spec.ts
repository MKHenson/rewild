// The texture half of the suite, kept apart because it is the slow half.
//
// One buildCanvas costs about 50ms in node and roughly 1.2s under jest, whose
// module isolation stops V8 optimising the per-texel loops. These tests build
// sixteen of them, so they dominate the run however cheap everything else is.
// 128 is the smallest size the leaf grid still draws at, and nothing here
// asserts anything a larger atlas would say differently.

import { resolveParams, type Params, type RawConfig } from './lib/params.ts';
import { barkStack, createSample, sampleBark } from './lib/bark.ts';
import { gutterFor, insetRect, leafCellPixels } from './lib/atlas.ts';
import { compositeCluster } from './lib/cluster.ts';
import { srgbToLinear } from './lib/colour.ts';
import type { LeafSource, LeafStamp } from './lib/sources.ts';
import { buildBarkCanvas, buildLeafCanvas, type Canvas } from './lib/textures.ts';

const SIZE = '128';

/**
 * How the generated bark and leaves look is settled in `lib/look.ts` and is no
 * longer a flag. It is still a field on Params, so a test that has to prove
 * what one of those values does overrides it here rather than on a command
 * line nobody can type.
 */
function paramsFor(extra: RawConfig = {}, look: Partial<Params> = {}): Params {
  return { ...resolveParams({ name: 'test-tree', textureSize: SIZE, ...extra }), ...look };
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
  const canvas = buildBarkCanvas(paramsFor());
  const leaves = buildLeafCanvas(paramsFor());

  it('leaves the bark opaque everywhere', () => {
    const bark = canvas.size * canvas.size;
    for (let i = 0; i < bark; i++) expect(canvas.alpha[i]).toBe(1);
  });

  it('cuts the leaf cells out rather than filling them', () => {
    const texels = leaves.size * leaves.size;
    let clear = 0;
    for (let i = 0; i < texels; i++) if (leaves.alpha[i] === 0) clear++;

    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(texels);
  });

  it('dilates colour under the transparent texels', () => {
    // Left black, the mip chain averages the background into every leaf edge.
    const texels = leaves.size * leaves.size;
    let litAndClear = 0;
    for (let i = 0; i < texels; i++)
      if (leaves.alpha[i] === 0 && leaves.albedo[i * 3 + 1] > 0) litAndClear++;

    expect(litAndClear).toBeGreaterThan(0);
  });

  /** Degrees between the warmest and coolest eighth of the bark half. */
  function patchHueRange(target: Canvas): number {
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
  function lichenShare(target: Canvas): number {
    const bark = target.size * target.size;
    let covered = 0;
    for (let i = 0; i < bark; i++) if (target.albedo[i * 3 + 1] >= target.albedo[i * 3]) covered++;
    return covered / bark;
  }

  it('drifts colour in hue, not only in brightness', () => {
    // Measured patch to patch rather than over the whole half. A global spread
    // is dominated by the near-black fissures, whose hue is meaningless, and
    // stays flat however far the colour actually moves.
    const flat = buildBarkCanvas(paramsFor({}, { colourVariation: 0, lichen: 0 }));
    const varied = buildBarkCanvas(paramsFor({}, { colourVariation: 0.35, lichen: 0 }));

    expect(patchHueRange(varied)).toBeGreaterThan(patchHueRange(flat) * 1.5);
  });

  it('makes --lichen mean coverage across its whole range', () => {
    // An octave sum clusters around its mean and reaches neither bound, so a
    // threshold picked by eye lands outside the distribution and the flag
    // silently does nothing. It did exactly that once.
    const none = buildBarkCanvas(paramsFor({}, { lichen: 0 }));
    const some = buildBarkCanvas(paramsFor({}, { lichen: 0.3 }));
    const lots = buildBarkCanvas(paramsFor({}, { lichen: 1 }));

    expect(lichenShare(none)).toBe(0);
    expect(lichenShare(some)).toBeGreaterThan(0.001);
    expect(lichenShare(lots)).toBeGreaterThan(lichenShare(some) * 3);
  });

  it('breaks roughness away from being a pure function of depth', () => {
    // Lichen off in both: it writes its own roughness, which would break the
    // "pure function of depth" the flat case is asserting.
    const flat = buildBarkCanvas(paramsFor({}, { roughnessVariation: 0, lichen: 0 }));
    const varied = buildBarkCanvas(paramsFor({}, { lichen: 0 }));

    /** How completely roughness is predicted by height, 0 to 1. */
    const dependence = (target: Canvas): number => {
      const bark = target.size * target.size;
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
    const bark = (target: Canvas) => target.size * target.size;
    const floorOf = (target: Canvas): number => {
      let lowest = 1;
      for (let i = 0; i < bark(target); i++) lowest = Math.min(lowest, target.height[i]);
      return lowest;
    };
    const darkestOf = (target: Canvas): number => {
      let darkest = 1;
      for (let i = 0; i < bark(target); i++) darkest = Math.min(darkest, target.albedo[i * 3]);
      return darkest;
    };

    const joined = buildBarkCanvas(paramsFor({}, { grooveDepth: 0, lichen: 0 }));
    const cut = buildBarkCanvas(paramsFor({}, { grooveDepth: 0.4, lichen: 0 }));
    const pale = buildBarkCanvas(
      paramsFor({}, { grooveDepth: 0.4, grooveShade: 0.85, lichen: 0 })
    );

    expect(floorOf(cut)).toBeLessThan(floorOf(joined));

    // Depth and darkness are separable on purpose: a groove can be deep enough
    // to catch a shadow without bottoming out as a black line.
    expect(darkestOf(pale)).toBeGreaterThan(darkestOf(cut));
    expect(floorOf(pale)).toBeCloseTo(floorOf(cut), 5);
  });

  /** Mean height step across one wrap, over the mean step just inside it. */
  function seamStep(target: Canvas, axis: 'ring' | 'length'): number {
    const size = target.size;
    let seam = 0;
    let inner = 0;
    let n = 0;

    for (let k = 0; k < size; k++) {
      const at = (a: number, b: number) => target.height[b * size + a];
      if (axis === 'ring') {
        seam += Math.abs(at(size - 1, k) - at(0, k));
        inner += Math.abs(at(1, k) - at(2, k));
      } else {
        seam += Math.abs(at(k, size - 1) - at(k, 0));
        inner += Math.abs(at(k, 1) - at(k, 2));
      }
      n++;
    }

    return seam / n / Math.max(inner / n, 1e-9);
  }

  it('closes the bark ring at every colour patch scale', () => {
    // The ring maps once across the image, so its two edges are the same place
    // on the tube. The lattice wraps on whole cells, so a fractional period
    // would put a seam down every trunk in the world.
    for (const patches of ['2', '5', '13']) {
      const target = buildBarkCanvas(paramsFor({}, { colourPatches: Number(patches) }));
      expect(seamStep(target, 'ring')).toBeLessThan(3);
    }
  });

  it('tiles the bark along the branch', () => {
    // Length repeats under a REPEAT sampler however long the branch is, so the
    // top and bottom edges meet as well.
    expect(seamStep(buildBarkCanvas(paramsFor()), 'length')).toBeLessThan(3);
  });

  it('scales the colour patches with --colour-patches', () => {
    // Measured as how fast colour changes across the band. Broad blotches vary
    // slowly, fine mottling varies quickly.
    const churn = (target: Canvas): number => {
      let total = 0;
      let n = 0;
      for (let y = 4; y < target.size - 4; y += 3)
        for (let x = 0; x < target.size - 1; x += 3) {
          const a = (y * target.size + x) * 3;
          const b = (y * target.size + x + 1) * 3;
          total += Math.abs(target.albedo[a] - target.albedo[b]) + Math.abs(target.albedo[a + 2] - target.albedo[b + 2]);
          n++;
        }
      return total / n;
    };

    const broad = buildBarkCanvas(paramsFor({}, { colourPatches: 2, colourVariation: 0.4 }));
    const fine = buildBarkCanvas(paramsFor({}, { colourPatches: 20, colourVariation: 0.4 }));

    expect(churn(fine)).toBeGreaterThan(churn(broad));
  });

  it('grows knots without tearing the bark around them', () => {
    const smooth = buildBarkCanvas(paramsFor({}, { knots: 0 }));
    const knotted = buildBarkCanvas(paramsFor({}, { knots: 1 }));

    /** The largest step between two side by side texels of the bark. */
    const worstStep = (target: Canvas): number => {
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
    expect(seamStep(buildBarkCanvas(paramsFor({}, { knots: 1 })), 'ring')).toBeLessThan(3);
  });

  it('runs the oak fissures along the trunk rather than around it', () => {
    // Length runs down the image and the ring across it, so a bark whose
    // fissures run up the trunk changes height far faster from column to column
    // than from row to row. This is the one assertion that would catch the
    // plate field losing its direction, which no test of depth or width can see.
    const target = buildBarkCanvas(paramsFor({}, { knots: 0, lichen: 0 }));
    const size = target.size;
    let alongStep = 0;
    let aroundStep = 0;
    let n = 0;

    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        alongStep += Math.abs(target.height[i] - target.height[((y + 1) % size) * size + x]);
        aroundStep += Math.abs(target.height[i] - target.height[y * size + ((x + 1) % size)]);
        n++;
      }

    expect(aroundStep / n).toBeGreaterThan((alongStep / n) * 1.5);
  });

  it('cuts every fissure to one width, whichever way it runs', () => {
    // The complaint this answers is that some cuts read as a line and others as
    // a smudge. Both come from measuring a width in the cell lattice: the cells
    // are several times wider than they are tall, and the warp stretches them
    // further and unevenly, so one authored width lands as a different width
    // everywhere. Depth is what is allowed to vary between cuts. Width is not.
    // Larger than the rest of the file runs at: at 128 a cut is under a texel
    // across, so every width would measure 1 and the assertion would hold
    // whatever the field did.
    const params = paramsFor({ textureSize: '512' }, { knots: 0, lichen: 0 });
    const size = params.textureSize;

    const stack = barkStack(params, params.seed);
    const sample = createSample();
    const cavity = new Float32Array(size * size);

    // Length runs down the image, the ring across it.
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        sampleBark(stack, sample, y / size, x / size);
        cavity[y * size + x] = sample.cavity;
      }

    // Scanned across the ring, which crosses the along-trunk fissures square
    // on. Each descent into a cut and back out is measured at half its own
    // depth, so a shallow cut and a deep one are compared on the same terms.
    const widths: number[] = [];
    for (let y = 0; y < size; y++) {
      let start = -1;
      for (let x = 0; x < size; x++) {
        const inside = cavity[y * size + x] > 0.02;
        if (inside && start < 0) start = x;
        if (inside || start < 0) continue;

        let peak = 0;
        for (let k = start; k < x; k++) peak = Math.max(peak, cavity[y * size + k]);
        let width = 0;
        for (let k = start; k < x; k++) if (cavity[y * size + k] > peak * 0.5) width++;
        if (peak > 0.05) widths.push(width);
        start = -1;
      }
    }

    widths.sort((a, b) => a - b);
    const at = (p: number) => widths[Math.floor(p * (widths.length - 1))];

    expect(widths.length).toBeGreaterThan(100);
    // Measured in whole texels, so the floor of the spread is the quantisation
    // rather than the field. Before the band's own metric was used this ran to
    // 8x, with a tail of single cuts spread over hundreds of texels.
    expect(at(0.9) / at(0.1)).toBeLessThanOrEqual(2);
    expect(at(0.99)).toBeLessThan(at(0.5) * 4);
  });

  it('bottoms a fissure in a crease rather than a plateau', () => {
    // A curve that arrives flat at the bottom leaves the deepest part of the
    // cut a flat floor a few texels across, which reads as a blurred line
    // however deep it is. The profile has to be steepest exactly where it is
    // deepest, which is what draws the line down the middle of the cut.
    const params = paramsFor({}, { knots: 0, lichen: 0 });
    const stack = barkStack(params, params.seed);
    const sample = createSample();

    // Walk across the deepest cut found on one column and compare the step
    // taken either side of its floor against the step out at the shoulder.
    let steepestNearFloor = 0;
    let shoulder = 0;

    for (let i = 0; i < 4000; i++) {
      const u = i / 4000;
      const v = 0.5;
      const step = 1 / params.textureSize;
      const here = sampleBark(stack, sample, u, v).cavity;
      if (here < 0.6) continue;

      const below = sampleBark(stack, sample, u, v - step).cavity;
      const above = sampleBark(stack, sample, u, v + step).cavity;
      steepestNearFloor = Math.max(steepestNearFloor, Math.abs(above - below) / 2);
      shoulder = Math.max(shoulder, here);
    }

    // A plateau would leave the two samples either side of the floor equal.
    expect(shoulder).toBeGreaterThan(0.6);
    expect(steepestNearFloor).toBeGreaterThan(0);
  });

  it('builds a different surface per --bark-profile', () => {
    const oak = buildBarkCanvas(paramsFor({ barkProfile: 'oak' }));
    const smooth = buildBarkCanvas(paramsFor({ barkProfile: 'smooth' }));

    expect(identical(oak.height, smooth.height)).toBe(false);

    /** Mean absolute height step between neighbouring texels, on both axes.
     *  One axis alone does not separate the profiles: they differ in how many
     *  cells run along the branch, and --bark-plates gives them the same number
     *  around it, so a scan across the ring crosses the same borders in each. */
    const relief = (target: Canvas): number => {
      const size = target.size;
      let total = 0;
      let n = 0;

      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          total += Math.abs(target.height[i] - target.height[y * size + ((x + 1) % size)]);
          total += Math.abs(target.height[i] - target.height[((y + 1) % size) * size + x]);
          n += 2;
        }

      return total / n;
    };

    // The profile is what decides how broken the surface is, so this is the
    // difference between the two that has to hold whatever else is tuned.
    expect(relief(oak)).toBeGreaterThan(relief(smooth));
    expect(() => paramsFor({ barkProfile: 'chestnut' })).toThrow(/barkProfile/);
  });

  it('sits plate tops at their own levels under --bark-step', () => {
    // A plate is a shelf, not a dome, and this is what makes two of them
    // neighbours at different heights rather than one continuous surface.
    const spread = (target: Canvas): number => {
      const bark = target.size * target.size;
      let sum = 0;
      let sumSq = 0;
      // Faces only. The fissures dominate any measure taken over everything,
      // and they are not what --bark-step moves.
      let n = 0;
      for (let i = 0; i < bark; i++)
        if (target.height[i] > 0.55) {
          sum += target.height[i];
          sumSq += target.height[i] * target.height[i];
          n++;
        }
      return Math.sqrt(sumSq / n - (sum / n) ** 2);
    };

    const level = buildBarkCanvas(paramsFor({}, { barkStep: 0, knots: 0, barkCrust: 0 }));
    const stepped = buildBarkCanvas(paramsFor({}, { barkStep: 0.3, knots: 0, barkCrust: 0 }));

    expect(spread(stepped)).toBeGreaterThan(spread(level) * 1.5);
  });

  it('shades curvature without moving the height it read', () => {
    const flat = buildBarkCanvas(paramsFor({}, { curvature: 0 }));

    expect(identical(canvas.height, flat.height)).toBe(true);
    expect(identical(canvas.albedo, flat.albedo)).toBe(false);
  });
});

/**
 * A stamp drawn in memory: a green bar `width` texels wide from row 2 to the
 * second-last row, over black, with height ramping from stem to tip. Black
 * under the alpha is what an authored source has, and is what the compositor's
 * alpha weighting is tested against.
 */
function stampOf(columns: number, rows: number, width: number): LeafStamp {
  const texels = columns * rows;
  const stamp: LeafStamp = {
    name: 'bar',
    lengthMetres: 1,
    columns,
    rows,
    albedo: new Float32Array(texels * 3),
    alpha: new Float32Array(texels),
    ao: new Float32Array(texels).fill(1),
    roughness: new Float32Array(texels).fill(0.5),
    metallic: new Float32Array(texels),
    height: new Float32Array(texels),
    extent: { left: Math.floor((columns - width) / 2), right: Math.floor((columns - width) / 2) + width - 1, top: 2, bottom: rows - 3 },
  };

  for (let y = stamp.extent.top; y <= stamp.extent.bottom; y++)
    for (let x = stamp.extent.left; x <= stamp.extent.right; x++) {
      const i = y * columns + x;
      stamp.alpha[i] = 1;
      stamp.albedo[i * 3 + 1] = srgbToLinear(0.5);
      stamp.height[i] = (stamp.extent.bottom - y) / (stamp.extent.bottom - stamp.extent.top);
    }

  return stamp;
}

function sourceOf(lengthMetres: number, ...stamps: LeafStamp[]): LeafSource {
  for (const stamp of stamps) stamp.lengthMetres = lengthMetres;
  return { names: ['test'], directories: ['memory'], lengthMetres, depthMetres: null, stamps };
}

describe('leaf assembly', () => {
  const params = paramsFor();
  const size = params.textureSize;
  const gutter = gutterFor(size);

  it('composites a spray into every cell of a derived grid and keeps the gutters clear', () => {
    // A tenth of a metre on a one metre card is the cluster case, so the
    // grid is the full four by four and every cell gets its own spray.
    const canvas = buildLeafCanvas(params, sourceOf(0.25, stampOf(16, 32, 6)));
    const cells = leafCellPixels(size, 4);

    for (const rect of cells) {
      const inner = insetRect(rect, gutter);
      let covered = 0;
      let inGutter = 0;

      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          const a = canvas.alpha[y * size + x];
          if (a <= 0) continue;
          const inside = x >= inner.x && x < inner.x + inner.width && y >= inner.y && y < inner.y + inner.height;
          if (inside) covered++;
          else inGutter++;
        }

      expect(covered).toBeGreaterThan(0);
      // The neighbour across the gutter is another leaf, so anything painted
      // into it is a leaf that bleeds into the wrong card.
      expect(inGutter).toBe(0);
    }
  });

  it('pins one leaf per card at the bottom-middle and gives it the whole cell', () => {
    // A leaf as long as its card is the frond case: one cell, no grid.
    const canvas = buildLeafCanvas(params, sourceOf(1, stampOf(16, 32, 6)));
    const inner = insetRect({ x: 0, y: 0, width: size, height: size }, gutter);
    const stemX = Math.floor(inner.x + inner.width / 2);

    // Covered just above the stem, and nowhere near the top gutter's far side.
    expect(canvas.alpha[(inner.y + inner.height - 2) * size + stemX]).toBeGreaterThan(0);
    expect(canvas.alpha[(inner.y + 1) * size + stemX]).toBeGreaterThan(0);
  });

  it('keeps the colour under a source alpha out of the leaf edge', () => {
    // The source is black under its cutout. A blend that reads that black
    // would darken every edge texel, and the mip chain would spread it.
    const canvas = buildLeafCanvas(params, sourceOf(0.25, stampOf(16, 32, 6)));
    const texels = size * size;
    let darkest = 1;
    let n = 0;

    for (let i = 0; i < texels; i++) {
      if (canvas.alpha[i] < 0.05) continue;
      darkest = Math.min(darkest, canvas.albedo[i * 3 + 1]);
      n++;
    }

    expect(n).toBeGreaterThan(0);
    // The bar is 0.5 in display space everywhere it has any coverage.
    expect(darkest).toBeGreaterThan(0.45);
  });

  it('rotates the height with the stamp so the normal can be derived after', () => {
    const source = sourceOf(1, stampOf(16, 32, 6));
    const canvas = buildLeafCanvas(params, null);
    canvas.alpha.fill(0);
    canvas.height.fill(0);
    const inner = { x: 0, y: 0, width: size, height: size };

    // Laid on its side, tip pointing +x, so the stem-to-tip ramp in the
    // stamp's height has to come out as a ramp along x on the canvas.
    const y = size / 2;
    compositeCluster(canvas, inner, source, [
      { stamp: 0, x: 8, y, dirX: 1, dirY: 0, length: 64, mirror: false, shade: 1 },
    ]);

    const at = (x: number) => canvas.height[y * size + x];
    expect(canvas.alpha[y * size + 40]).toBeGreaterThan(0.9);
    expect(at(20)).toBeLessThan(at(40));
    expect(at(40)).toBeLessThan(at(60));
    // And nothing past the bar's own half-width, which is three source texels
    // at a scale of 64 over 28.
    expect(canvas.alpha[(y - 12) * size + 40]).toBe(0);
  });
});

