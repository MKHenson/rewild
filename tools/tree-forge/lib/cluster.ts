// A leaf cell assembled from authored stamps.
//
// A card stands in for a spray of foliage, and what fills it follows from one
// number: how many leaf lengths fit the card's height. Many, and the cell is a
// fan of sprigs with a leaf at every node, rotated about its stem and scaled to
// its declared size. One, and the cell is the leaf itself — a palm frond is not
// a small leaf at higher resolution, it is a different relationship to the
// card, and nothing here has to know that as a category.
//
// Stamps composite in float and in linear, alpha-weighted so the colour a
// source leaves under its cutout never reaches an edge, and the normal is
// derived from the composited height afterwards, so nothing ever rotates a
// tangent-space vector.

import { linearToSrgb, srgbToLinear } from './colour.ts';
import type { PixelRect } from './atlas.ts';
import type { LeafSource, LeafStamp } from './sources.ts';
import { stampLengthPx } from './sources.ts';
import type { Rng } from './rng.ts';
import type { Canvas } from './textures.ts';

/** One stamp laid on the canvas. */
export interface Placement {
  stamp: number;
  /** The stem, in canvas texels. */
  x: number;
  y: number;
  /** Unit direction from stem to tip. -y is up in image space. */
  dirX: number;
  dirY: number;
  /** Stem to tip, in canvas texels. */
  length: number;
  mirror: boolean;
  /** Occlusion factor. A sprig behind the front one sits in its shade, which
   *  is the only depth a flat card can carry. */
  shade: number;
}

interface Sprig {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  length: number;
  shade: number;
}

const DEG = Math.PI / 180;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function aspectOf(stamp: LeafStamp): number {
  return (stamp.extent.right - stamp.extent.left + 1) / stampLengthPx(stamp);
}

/** Whether every corner of a placed stamp's cutout lands inside the rect. */
function fits(p: Placement, aspect: number, inner: PixelRect): boolean {
  const rx = -p.dirY;
  const ry = p.dirX;
  const half = (p.length * aspect) / 2;

  for (const along of [0, p.length])
    for (const across of [-half, half]) {
      const x = p.x + p.dirX * along + rx * across;
      const y = p.y + p.dirY * along + ry * across;
      if (x < inner.x || x > inner.x + inner.width || y < inner.y || y > inner.y + inner.height) return false;
    }

  return true;
}

/** How long each stamp is against the longest, so mixed folders keep their
 *  own sizes on one card. */
function relativeLengths(source: LeafSource): number[] {
  return source.stamps.map((stamp) => stamp.lengthMetres / source.lengthMetres);
}

function leafAt(rng: Rng, sprig: Sprig, t: number, angle: number, length: number, relative: number[]): Placement {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const stamp = Math.floor(rng() * relative.length) % relative.length;

  return {
    stamp,
    x: sprig.x + sprig.dirX * sprig.length * t,
    y: sprig.y + sprig.dirY * sprig.length * t,
    dirX: sprig.dirX * cos - sprig.dirY * sin,
    dirY: sprig.dirX * sin + sprig.dirY * cos,
    length: length * relative[stamp],
    mirror: rng() < 0.5,
    shade: sprig.shade,
  };
}

function leavesAlong(rng: Rng, sprig: Sprig, leafLength: number, relative: number[], out: Placement[]): void {
  // Nodes closer than this overlap into a mat; further apart and the sprig
  // reads as leaves floating around a stick.
  const spacing = leafLength * 0.5;
  const nodes = Math.max(1, Math.floor(sprig.length / spacing));
  const flip = rng() < 0.5 ? 1 : -1;

  for (let k = 0; k < nodes; k++) {
    const t = (k + 0.5) / nodes;
    const side = (k % 2 === 0 ? 1 : -1) * flip;
    // Only a little shorter toward the tip: these are leaves at their real
    // size, and the taper the generator used would misstate it.
    const length = leafLength * mix(1, 0.85, t) * rng.range(0.92, 1.08);
    out.push(leafAt(rng, sprig, t, side * (42 + rng.range(-12, 12)) * DEG, length, relative));
  }

  // A rosette at the tip, which is where a twig's leaves actually crowd.
  for (const spread of [-1, 0, 1])
    out.push(leafAt(rng, sprig, 1, spread * (30 + rng.range(-8, 8)) * DEG, leafLength * 0.9, relative));
}

/**
 * Where every stamp goes in one cell.
 *
 * `perCell` is leaf lengths along the card's height. Under two, the cell holds
 * one leaf pinned at the bottom-middle, which is the frond case. Otherwise a
 * central sprig runs up from the stem with side sprigs fanning off its lower
 * half, each sized to stay inside the cell, and every node carries a leaf.
 * Sprigs behind are drawn first and shaded, the central one last and lit.
 */
export function clusterFor(
  rng: Rng,
  inner: PixelRect,
  source: LeafSource,
  perCell: number,
  variant: number
): Placement[] {
  const stampCount = source.stamps.length;
  const relative = relativeLengths(source);
  const aspect = Math.max(...source.stamps.map(aspectOf));
  const stemX = inner.x + inner.width / 2;
  const stemY = inner.y + inner.height;
  // Fitted to the width as well: a leaf wider than it is long has to come
  // down to the cell however many of it the height would take.
  const leafLength = Math.min(inner.height / perCell, inner.width / aspect);

  if (perCell < 2) {
    const angle = rng.range(-3, 3) * DEG;
    const stamp = variant % stampCount;
    return [
      {
        // Variety for a single leaf per cell is which stamp it is and which
        // way round, so cells walk the set before they start mirroring it.
        stamp,
        x: stemX,
        y: stemY,
        dirX: Math.sin(angle),
        dirY: -Math.cos(angle),
        length: leafLength * relative[stamp],
        mirror: Math.floor(variant / stampCount) % 2 === 1,
        shade: 1,
      },
    ];
  }

  const lean = rng.range(-4, 4) * DEG;
  const central: Sprig = {
    x: stemX,
    y: stemY,
    dirX: Math.sin(lean),
    dirY: -Math.cos(lean),
    length: inner.height * 0.92 - leafLength,
    shade: 1,
  };

  // Sprigs follow leaf count: a card of small leaves is a full spray and a
  // card of large ones is a single stem.
  const sprigs = Math.max(1, Math.min(7, Math.round(perCell * 0.7)));
  const sides: Sprig[] = [];

  for (let i = 1; i < sprigs; i++) {
    const side = i % 2 === 1 ? 1 : -1;
    const t = mix(0.06, 0.66, sprigs > 2 ? (i - 1) / (sprigs - 2) : 0);
    const angle = side * (32 + rng.range(0, 22)) * DEG;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = central.x + central.dirX * central.length * t;
    const y = central.y + central.dirY * central.length * t;
    const dirX = central.dirX * cos - central.dirY * sin;
    const dirY = central.dirX * sin + central.dirY * cos;

    // As long as the cell allows on either axis, with a leaf's length held
    // back for the leaves at its end, and never past the central sprig.
    const reachX = (inner.width / 2 - Math.abs(x - stemX) - leafLength) / Math.max(Math.abs(dirX), 1e-3);
    const reachY = (y - inner.y - leafLength) / Math.max(-dirY, 1e-3);
    const length = Math.min(reachX, reachY, central.length * 0.75) * rng.range(0.85, 1);
    if (length < leafLength) continue;

    sides.push({ x, y, dirX, dirY, length, shade: 0.86 });
  }

  const placements: Placement[] = [];
  // Outermost first, so the front of the spray is the lit centre.
  for (const sprig of sides.reverse()) leavesAlong(rng, sprig, leafLength, relative, placements);
  leavesAlong(rng, central, leafLength, relative, placements);

  return placements.filter((p) => fits(p, aspectOf(source.stamps[p.stamp]), inner));
}

// Accumulator slots: alpha, then alpha-weighted r, g, b, height, ao, roughness,
// metallic. One buffer reused for every subsample of every texel.
const A = 0;
const R = 1;
const G = 2;
const B = 3;
const H = 4;
const O = 5;
const RO = 6;
const M = 7;

function tap(stamp: LeafStamp, x: number, y: number, w: number, acc: Float32Array): void {
  if (x < 0 || y < 0 || x >= stamp.columns || y >= stamp.rows) return;
  const i = y * stamp.columns + x;
  const a = stamp.alpha[i] * w;
  if (a <= 0) return;

  acc[A] += a;
  acc[R] += stamp.albedo[i * 3] * a;
  acc[G] += stamp.albedo[i * 3 + 1] * a;
  acc[B] += stamp.albedo[i * 3 + 2] * a;
  acc[H] += stamp.height[i] * a;
  acc[O] += stamp.ao[i] * a;
  acc[RO] += stamp.roughness[i] * a;
  acc[M] += stamp.metallic[i] * a;
}

/**
 * Bilinear read at a stamp coordinate, weighted by alpha.
 *
 * Weighting by alpha is what keeps an authored source's background out of the
 * result: a texel under the cutout contributes nothing however it is coloured,
 * so the edge is the leaf's own colour and not a blend toward black.
 */
function sampleStamp(stamp: LeafStamp, sx: number, sy: number, acc: Float32Array): void {
  const fx = sx - 0.5;
  const fy = sy - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  tap(stamp, x0, y0, (1 - tx) * (1 - ty), acc);
  tap(stamp, x0 + 1, y0, tx * (1 - ty), acc);
  tap(stamp, x0, y0 + 1, (1 - tx) * ty, acc);
  tap(stamp, x0 + 1, y0 + 1, tx * ty, acc);
}

/**
 * Composites one placed stamp over the canvas, clipped to `inner`.
 *
 * A stamp is nearly always shrunk a long way — a 10cm leaf on a 1m card gets a
 * tenth of the cell — so each canvas texel averages a grid of subsamples that
 * covers the source texels it lands on, rather than picking one and aliasing.
 */
function stampInto(canvas: Canvas, inner: PixelRect, source: LeafSource, p: Placement, acc: Float32Array): void {
  const stamp = source.stamps[p.stamp];
  const scale = p.length / stampLengthPx(stamp);
  const pivotX = stamp.columns / 2;
  const pivotY = stamp.extent.bottom + 1;
  const flip = p.mirror ? -1 : 1;
  const rx = -p.dirY;
  const ry = p.dirX;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cx of [stamp.extent.left, stamp.extent.right + 1])
    for (const cy of [stamp.extent.top, pivotY]) {
      const along = (pivotY - cy) * scale;
      const across = (cx - pivotX) * scale * flip;
      const x = p.x + p.dirX * along + rx * across;
      const y = p.y + p.dirY * along + ry * across;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

  const x0 = Math.max(inner.x, Math.floor(minX));
  const x1 = Math.min(inner.x + inner.width - 1, Math.ceil(maxX));
  const y0 = Math.max(inner.y, Math.floor(minY));
  const y1 = Math.min(inner.y + inner.height - 1, Math.ceil(maxY));

  const ss = Math.max(1, Math.min(6, Math.ceil(1 / scale)));
  const samples = ss * ss;
  const { size } = canvas;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      acc.fill(0);

      for (let j = 0; j < ss; j++) {
        const dy = y + (j + 0.5) / ss - p.y;
        for (let i = 0; i < ss; i++) {
          const dx = x + (i + 0.5) / ss - p.x;
          const along = dx * p.dirX + dy * p.dirY;
          const across = (dx * rx + dy * ry) * flip;
          sampleStamp(stamp, pivotX + across / scale, pivotY - along / scale, acc);
        }
      }

      const a = acc[A] / samples;
      if (a <= 1e-4) continue;

      const t = y * size + x;
      const dst = canvas.alpha[t];
      const out = a + dst * (1 - a);
      const ws = a / out;
      const wd = 1 - ws;

      for (let c = 0; c < 3; c++) {
        const src = acc[R + c] / acc[A];
        const under = wd > 0 ? srgbToLinear(canvas.albedo[t * 3 + c]) : 0;
        canvas.albedo[t * 3 + c] = clamp01(linearToSrgb(src * ws + under * wd));
      }

      canvas.alpha[t] = out;
      canvas.height[t] = (acc[H] / acc[A]) * ws + canvas.height[t] * wd;
      canvas.ao[t] = (acc[O] / acc[A]) * p.shade * ws + canvas.ao[t] * wd;
      canvas.roughness[t] = (acc[RO] / acc[A]) * ws + canvas.roughness[t] * wd;
      canvas.metallic[t] = (acc[M] / acc[A]) * ws + canvas.metallic[t] * wd;
    }
  }
}

/** Paints a cell's placements in order, later ones over earlier. */
export function compositeCluster(canvas: Canvas, inner: PixelRect, source: LeafSource, placements: Placement[]): void {
  const acc = new Float32Array(8);
  for (const p of placements) stampInto(canvas, inner, source, p, acc);
}
