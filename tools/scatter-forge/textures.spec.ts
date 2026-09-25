// The texture half of the suite, kept apart because it is the slow half.
//
// One buildCanvas costs about 50ms. These tests build sixteen of them, so they
// dominate the run however cheap everything else is.
// 128 is the smallest size the leaf grid still draws at, and nothing here
// asserts anything a larger atlas would say differently.

import { resolveParams, type Params, type RawConfig } from './lib/params.ts';
import { columnPixels, gutterFor, insetRect, leafCellPixels, type PixelRect } from './lib/atlas.ts';
import { compositeCluster } from './lib/cluster.ts';
import { srgbToLinear } from './lib/colour.ts';
import { CROWN_CELLS_GENERATED, type LeafSource, type LeafStamp } from './lib/sources.ts';
import { buildBarkCanvas, buildCrownCanvases, buildFrondCanvas, buildLeafCanvas, type Canvas } from './lib/textures.ts';

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
    const bark = canvas.width * canvas.height;
    for (let i = 0; i < bark; i++) expect(canvas.alpha[i]).toBe(1);
  });

  it('cuts the leaf cells out rather than filling them', () => {
    const texels = leaves.width * leaves.height;
    let clear = 0;
    for (let i = 0; i < texels; i++) if (leaves.alpha[i] === 0) clear++;

    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(texels);
  });

  it('dilates colour under the transparent texels', () => {
    // Left black, the mip chain averages the background into every leaf edge.
    const texels = leaves.width * leaves.height;
    let litAndClear = 0;
    for (let i = 0; i < texels; i++)
      if (leaves.alpha[i] === 0 && leaves.albedo[i * 3 + 1] > 0) litAndClear++;

    expect(litAndClear).toBeGreaterThan(0);
  });



  /**
   * Mean relief step across one wrap, over the mean step just inside it.
   *
   * A tileable field meets itself, so the step across the seam is the step
   * anywhere else. A field that does not puts a hard line down every trunk in
   * the world, and nothing else in the suite would catch it.
   */
  function seamStep(target: Canvas, axis: 'ring' | 'length'): number {
    const { width, height } = target;
    const at = (x: number, y: number) => target.relief[y * width + x];
    // Walked along whichever edge the wrap is on: the ring closes across the
    // image and the length repeats down it, and the two are no longer the same
    // length in texels.
    const steps = axis === 'ring' ? height : width;
    let seam = 0;
    let inner = 0;

    for (let k = 0; k < steps; k++) {
      if (axis === 'ring') {
        seam += Math.abs(at(width - 1, k) - at(0, k));
        inner += Math.abs(at(1, k) - at(2, k));
      } else {
        seam += Math.abs(at(k, height - 1) - at(k, 0));
        inner += Math.abs(at(k, 1) - at(k, 2));
      }
    }

    return seam / Math.max(1e-9, inner);
  }

  it('closes the bark ring where it wraps', () => {
    // x is one turn of the tube, so its two edges are the same line of trunk.
    expect(seamStep(buildBarkCanvas(paramsFor()), 'ring')).toBeLessThan(3);
  });

  it('tiles the bark along the branch', () => {
    // Length repeats under a REPEAT sampler however long the branch is, so the
    // top and bottom edges meet as well.
    expect(seamStep(buildBarkCanvas(paramsFor()), 'length')).toBeLessThan(3);
  });

  it('cuts the bark map taller than it is wide, and only the bark map', () => {
    // The two axes of a bark map are not alike. x wraps once around the ring
    // and never repeats; y runs along the branch and repeats every tile, which
    // is the repetition seen on a trunk. So the texels go where the repeat is.
    const shaped = buildBarkCanvas(paramsFor({ textureSize: 1024, barkAspect: 2 }));
    expect([shaped.width, shaped.height]).toEqual([512, 1024]);

    const square = buildBarkCanvas(paramsFor({ textureSize: 1024, barkAspect: 1 }));
    expect([square.width, square.height]).toEqual([1024, 1024]);

    // A leaf atlas stays square: its cells are square and a rectangle would
    // only waste half of each one.
    const leaf = buildLeafCanvas(paramsFor({ textureSize: 1024, barkAspect: 2 }));
    expect([leaf.width, leaf.height]).toEqual([1024, 1024]);
  });

  it('runs the fissures along the trunk rather than around it', () => {
    // Length runs down the image and the ring across it, so a bark whose
    // fissures run up the trunk changes height far faster from column to column
    // than from row to row. This is the one assertion that would catch the
    // plate field losing its direction, which no test of depth or width can see.
    const target = buildBarkCanvas(paramsFor());
    const { width, height } = target;
    let alongStep = 0;
    let aroundStep = 0;
    let n = 0;

    // One texel is the same distance of trunk either way, whatever the map's
    // shape: its width covers one circumference and its height covers
    // barkAspect of them, so the two axes carry equal texels per metre.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        alongStep += Math.abs(target.relief[i] - target.relief[((y + 1) % height) * width + x]);
        aroundStep += Math.abs(target.relief[i] - target.relief[y * width + ((x + 1) % width)]);
        n++;
      }

    expect(aroundStep / n).toBeGreaterThan((alongStep / n) * 1.5);
  });

  it('shades curvature without moving the height it read', () => {
    const flat = buildBarkCanvas(paramsFor({}, { curvature: 0 }));

    expect(identical(canvas.relief, flat.relief)).toBe(true);
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
    derived: [],
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
    canvas.relief.fill(0);
    const inner = { x: 0, y: 0, width: size, height: size };

    // Laid on its side, tip pointing +x, so the stem-to-tip ramp in the
    // stamp's height has to come out as a ramp along x on the canvas.
    const y = size / 2;
    compositeCluster(canvas, inner, source, [
      { stamp: 0, x: 8, y, dirX: 1, dirY: 0, length: 64, mirror: false, shade: 1 },
    ]);

    const at = (x: number) => canvas.relief[y * size + x];
    expect(canvas.alpha[y * size + 40]).toBeGreaterThan(0.9);
    expect(at(20)).toBeLessThan(at(40));
    expect(at(40)).toBeLessThan(at(60));
    // And nothing past the bar's own half-width, which is three source texels
    // at a scale of 64 over 28.
    expect(canvas.alpha[(y - 12) * size + 40]).toBe(0);
  });
});


describe('frond atlas', () => {
  const params = paramsFor({ type: 'crown', name: 'test-crown', cardAspect: 0.3 });
  const canvas = buildFrondCanvas(params);

  // The card samples a centred column of its cell, `cardAspect` of the cell's
  // height wide. A frond painted outside it would never be seen, and a column
  // left blank would leave the card empty.
  it('paints every frond inside the column its card samples, and nothing outside it', () => {
    const rects = leafCellPixels(canvas.width, 2).slice(0, CROWN_CELLS_GENERATED);
    const gutter = gutterFor(canvas.width);

    for (const rect of rects) {
      const inner = insetRect(rect, gutter);
      const column = columnPixels(inner, params.cardAspect);
      let inside = 0;
      let outside = 0;

      for (let y = inner.y; y < inner.y + inner.height; y++)
        for (let x = inner.x; x < inner.x + inner.width; x++) {
          if (canvas.alpha[y * canvas.width + x] <= 0) continue;
          if (x >= column.x && x < column.x + column.width) inside++;
          else outside++;
        }

      expect(inside).toBeGreaterThan(column.width * column.height * 0.2);
      expect(outside).toBe(0);
    }
  });

  it('ships bark only with a stem', () => {
    expect(Object.keys(buildCrownCanvases(params, true))).toEqual(['bark', 'frond']);
    expect(Object.keys(buildCrownCanvases(params, false))).toEqual(['frond']);
  });
});

describe('accent cells', () => {
  // One leaf per card is the one-cell leaf case, so with two accent stamps the
  // image is cut 2x2: the leaf in cell 0, the accents in 1 and 2, cell 3 blank.
  const params = paramsFor({ accents: [{ stamps: ['x'], count: 1, pitch: 180, length: 0.2 }] as never });
  const accent = sourceOf(0.2, stampOf(16, 32, 6), stampOf(16, 32, 4));
  const canvas = buildLeafCanvas(params, sourceOf(1, stampOf(16, 32, 6)), [accent]);
  const size = params.textureSize;
  const gutter = gutterFor(size);
  const rects = leafCellPixels(size, 2);

  const covered = (rect: PixelRect): number => {
    let count = 0;
    for (let y = rect.y; y < rect.y + rect.height; y++)
      for (let x = rect.x; x < rect.x + rect.width; x++) if (canvas.alpha[y * size + x] > 0) count++;
    return count;
  };

  it('paints one accent stamp per cell after the host, pinned at the bottom-middle, and leaves the rest blank', () => {
    expect(covered(rects[0])).toBeGreaterThan(0);
    expect(covered(rects[1])).toBeGreaterThan(0);
    expect(covered(rects[2])).toBeGreaterThan(0);
    expect(covered(rects[3])).toBe(0);

    for (const rect of rects.slice(1, 3)) {
      const inner = insetRect(rect, gutter);
      const stemX = Math.floor(inner.x + inner.width / 2);
      expect(canvas.alpha[(inner.y + inner.height - 2) * size + stemX]).toBeGreaterThan(0);
      expect(canvas.alpha[(inner.y + 1) * size + stemX]).toBeGreaterThan(0);
    }

    // The two stamps land in their own cells, narrow one second.
    expect(covered(rects[1])).toBeGreaterThan(covered(rects[2]));
  });
});
