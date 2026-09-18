// The texture template: one 4-map set laid out as bark over leaves, written as
// lossless WebP.
//
// It is a template, not a finished asset. What it guarantees is the contract —
// four maps at one size on one layout, data maps linear and lossless, leaf
// colour dilated under the alpha — so an artist can repaint any of them in
// place without the UVs, the material or the audit changing.

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { columnPixels, gutterFor, insetRect, leafCellPixels, type PixelRect } from './atlas.ts';
import {
  clumpAtlas,
  crownAtlas,
  fitBark,
  fitClump,
  fitCrown,
  fitLeaves,
  gradientGain,
  LEAF_GRID_GENERATED,
  normalStrength,
  type BarkSource,
  type LeafSource,
} from './sources.ts';
import { woodAt } from './wood.ts';
import { clusterFor, compositeCluster } from './cluster.ts';
import { fbm, signedFbm, warp } from './noise.ts';
import { createRng, type Rng } from './rng.ts';
import { barkCanvasSize, barkTextureSize, type Params } from './params.ts';

/** The atlas as float channels, before any of it is quantised or encoded. */
export interface Canvas {
  /**
   * Texels across the image and down it.
   *
   * Square for every piece but bark. Bark's is `barkAspect` times taller than
   * it is wide, because its two axes are not alike: x wraps once around the
   * ring and never repeats, and y runs along the branch and repeats every
   * tile. Texels spent on x buy sharpness; texels spent on y buy the distance
   * before the eye sees the same plate again.
   */
  width: number;
  height: number;
  /** The gradient gain this canvas's own height needs to become a normal. A
   *  sourced image derives it from the depth the source declares; a generated
   *  one takes the settled value. */
  bumpStrength: number;
  /** Three floats a texel, in display space. */
  albedo: Float32Array;
  alpha: Float32Array;
  /** The surface, 0..1. Named for what it is rather than `height`, which on a
   *  canvas is a dimension. */
  relief: Float32Array;
  ao: Float32Array;
  roughness: Float32Array;
  metallic: Float32Array;
}

/** The four files one image is written as, by role. */
export interface TextureNames {
  baseColor: string;
  normal: string;
  arm: string;
  height: string;
}

/** One image set per piece, keyed by the piece's own key. Separate because
 *  pieces are separate materials — see the header of atlas.ts. */
export type TextureSetNames = Record<string, TextureNames>;

/** The same sets as float channels, before anything is quantised. */
export type Canvases = Record<string, Canvas>;

type Rgb = [number, number, number];

interface Leaflet {
  base: [number, number];
  direction: [number, number];
  length: number;
  halfWidth: number;
  hue: number;
  tone: number;
  /** A frond's rachis: the one shape in its cell that keeps its width. */
  kind?: 'rachis';
}

// The bounds a 4-octave sum of this noise actually spans, measured rather than
// assumed. Thresholds outside them are the difference between a flag that does
// nothing and one that covers the whole trunk.
const DEG = Math.PI / 180;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scaleRgb = (c: Rgb, s: number): Rgb => [c[0] * s, c[1] * s, c[2] * s];


// Weathering runs along one axis, from fresh warm tissue to grey-blue exposure.
// Blending toward these keeps the drift inside colours bark and leaves actually
// take, where three independent channels wander into magenta and cyan.
// These must straddle the tint they grade, or the blend is a no-op. An earlier
// "warm" of [1, 0.66, 0.34] sat at 29 degrees, which is bark's own hue, so half
// the field graded toward the colour it already was.
const WARM: Rgb = [1, 0.42, 0.18];
const COOL: Rgb = [0.5, 0.58, 0.68];

const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Drifts a colour in hue, not only in brightness, along the warm-to-cool axis.
 *
 * Blends toward a target held at the source's own luminance, rather than
 * scaling the channels. Scaling cannot do this job: hue is a ratio between
 * channels, and multiplying an already red-dominant colour by more red moves
 * every channel in proportion and leaves the hue exactly where it was.
 */
function driftColour(
  colour: Rgb,
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  amount: number
): Rgb {
  if (amount <= 0) return colour;

  const warmth = signedFbm(x, y, periodX, periodY, 2, seed + 101);
  const value = signedFbm(x, y, periodX, periodY, 2, seed + 211) * 0.5;

  const target = warmth > 0 ? WARM : COOL;
  const matched = scaleRgb(target, luminance(colour) / luminance(target));

  return scaleRgb(mixRgb(colour, matched, Math.abs(warmth) * amount), 1 + value * amount);
}

/**
 * Signed offset for the roughness channel. Worth as much as colour variation
 * and currently absent: roughness is a pure function of depth, so a whole
 * surface catches light identically as the viewer moves across it.
 */
function roughnessDrift(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  amount: number
): number {
  if (amount <= 0) return 0;
  return signedFbm(x, y, periodX, periodY, 3, seed + 409) * amount;
}

function parseHex(value: string | undefined, field: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value ?? '');
  if (!match) throw new Error(`--${field} must be a six digit hex colour, got '${value}'.`);
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function createCanvas(width: number, height: number, bumpStrength: number): Canvas {
  const texels = width * height;
  return {
    width,
    height,
    bumpStrength,
    albedo: new Float32Array(texels * 3),
    alpha: new Float32Array(texels),
    relief: new Float32Array(texels),
    ao: new Float32Array(texels).fill(1),
    roughness: new Float32Array(texels).fill(0.8),
    metallic: new Float32Array(texels),
  };
}

/**
 * The generated bark: the wood pattern, tinted and shaded from its own relief.
 *
 * Three stops rather than two, which is most of what makes a wood texture read
 * as rich rather than as a tinted heightfield: crevice, mid, and the exposed
 * face that catches the light.
 */
function paintBark(canvas: Canvas, params: Params): void {
  const { width, height } = canvas;
  const face = parseHex(params.barkTint, 'bark-tint');
  const crevice = scaleRgb(face, 0.24);

  for (let y = 0; y < height; y++) {
    // y runs along the branch and x around the ring, which is the way bark is
    // authored and the way the tube samples it.
    const along = y / height;

    for (let x = 0; x < width; x++) {
      const relief = woodAt(params, x / width, along);
      const i = y * width + x;

      // Ramped straight from crevice to face. A three-stop ramp with a mid
      // point crushes the lower half into near-black, which is what the first
      // cut of this did: the bands between the grain read as holes.
      for (let c = 0; c < 3; c++)
        canvas.albedo[i * 3 + c] = clamp01(mix(crevice[c], face[c], relief));

      canvas.alpha[i] = 1;
      canvas.relief[i] = relief;
      // A crevice holds shadow and dust; a face is worn smoother and lighter.
      canvas.ao[i] = 0.55 + 0.45 * relief;
      canvas.roughness[i] = clamp01(0.94 - 0.18 * relief);
      canvas.metallic[i] = 0;
    }
  }
}

/** One compound leaf per cell: a rachis with leaflets alternating along it. */
function leafletsFor(rng: Rng, cell: number, variant: number): Leaflet[] {
  const count = [5, 7, 9, 7, 6, 8, 5, 7][variant % 8];
  const rachisBase: [number, number] = [cell * 0.5, cell * 0.96];
  const rachisTip: [number, number] = [cell * (0.5 + (rng() - 0.5) * 0.12), cell * 0.07];
  const leaflets: Leaflet[] = [];

  for (let i = 0; i < count; i++) {
    const t = 0.12 + (0.8 * i) / Math.max(1, count - 1);
    const side = i % 2 === 0 ? 1 : -1;
    const base: [number, number] = [mix(rachisBase[0], rachisTip[0], t), mix(rachisBase[1], rachisTip[1], t)];

    // Leaflets shorten toward the tip, which is what makes a cluster read as a
    // leaf rather than a fan.
    const scale = mix(1, 0.55, t) * rng.range(0.85, 1.15);
    const angle = side * (50 + (rng() - 0.5) * 24) * (Math.PI / 180);

    leaflets.push({
      base,
      // -y is up in image space, so the leaflet climbs as it leaves the rachis.
      direction: [Math.sin(angle), -Math.cos(angle)],
      length: cell * 0.44 * scale,
      halfWidth: cell * 0.115 * scale,
      hue: rng.range(-0.06, 0.06),
      tone: rng.range(0.85, 1.15),
    });
  }

  leaflets.push({
    base: [mix(rachisBase[0], rachisTip[0], 0.86), mix(rachisBase[1], rachisTip[1], 0.86)],
    direction: [0, -1],
    length: cell * 0.3,
    halfWidth: cell * 0.095,
    hue: rng.range(-0.05, 0.05),
    tone: rng.range(0.9, 1.1),
  });

  return leaflets;
}

/**
 * Half-width of a leaflet at `along`, eaten into lobes.
 *
 * A plain `sin` profile is a perfect lens, and a cutout is read almost entirely
 * by its silhouette, so a lens is the single most synthetic thing about the
 * leaf half. Perturbing the profile with a noise field along the leaflet gives
 * an irregular margin for the cost of one lookup.
 */
function leafletWidth(leaflet: Leaflet, along: number, params: Params, variant: number): number {
  const base = leaflet.halfWidth * Math.sin(Math.PI * clamp01(along) ** 0.65);
  if (params.leafSerration <= 0) return base;

  // Faded in off the base and out before the tip. Both ends are already narrow,
  // so a lobe there does not read as a margin, it reads as a bite taken out of
  // the leaf.
  const taper = smoothstep(0, 0.3, along) * (1 - smoothstep(0.72, 0.98, along));
  const lobes = fbm(along * 14, variant * 3 + leaflet.hue * 40, 14, 12, 3, params.seed + 61);

  return base * (1 - params.leafSerration * taper * (1 - lobes));
}

/**
 * Vein pattern as a ridge field: a midrib, plus secondaries running out toward
 * the margin at an angle.
 *
 * The secondaries fall out of shearing the along-coordinate by the across one,
 * so lines of constant value are the chevrons a real leaf has, rather than the
 * straight bands a sine of `along` alone produces.
 */
function leafVeins(along: number, across: number, width: number): number {
  const midrib = Math.exp(-((across / Math.max(width * 0.13, 0.55)) ** 2));

  const chevron = along * 5 - (Math.abs(across) / Math.max(width, 0.001)) * 1.7;
  const offset = Math.abs(chevron - Math.floor(chevron) - 0.5) * 2;
  // Secondaries fade out at the midrib and at the margin, where they would
  // otherwise cross the vein they branch from and run off the edge.
  const reach = smoothstep(0.08, 0.3, Math.abs(across) / Math.max(width, 0.001)) * (1 - midrib);
  const secondary = (1 - smoothstep(0, 0.12, offset)) * reach;

  return clamp01(Math.max(midrib, secondary * 0.5));
}

/**
 * What a generated cell draws: the shapes in it, and how wide each one is
 * along its own length.
 *
 * The pixel loop below is the same whichever it is, because a leaflet and a
 * blade differ only in where they sit and how they taper. Veins are the one
 * feature a blade does without: a grass blade has a fold, not a network, and
 * the ridge field reads as a leaf the moment it forks.
 */
interface CellStyle {
  shapes: Leaflet[];
  width: (shape: Leaflet, along: number) => number;
  veins: boolean;
  /** Base colour, six digit hex. A blade's is not a leaf's — see look.ts. */
  tint: string;
}

/** Builds a cell's style. `rect` is the cell in texels, origin at its own corner. */
type StyleFor = (params: Params, rng: Rng, rect: PixelRect, variant: number) => CellStyle;

/** The edge a square cell's shapes are scaled by. */
const cellEdge = (rect: PixelRect): number => Math.min(rect.width, rect.height);

const leafStyle: StyleFor = (params, rng, rect, variant) => ({
  shapes: leafletsFor(rng, cellEdge(rect), variant),
  width: (shape, along) => leafletWidth(shape, along, params, variant),
  veins: true,
  tint: params.leafTint,
});

function paintFoliageCell(canvas: Canvas, params: Params, rect: PixelRect, variant: number, makeStyle: StyleFor): void {
  const { width } = canvas;
  const cell = cellEdge(rect);
  const rng = createRng((params.seed ^ 0x2f6b1e3d) + variant * 7919);
  const style = makeStyle(params, rng, rect, variant);
  const tint = parseHex(style.tint, 'tint');
  const leaflets = style.shapes;

  // Softens the cutout by roughly a texel. Any wider and the alphaCutoff walks
  // the silhouette as the mip level changes.
  const EDGE = 1.4;

  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      let coverage = 0;
      let overlaps = 0;
      let best: { leaflet: Leaflet; along: number; across: number; width: number } | null = null;

      for (const leaflet of leaflets) {
        const dx = lx + 0.5 - leaflet.base[0];
        const dy = ly + 0.5 - leaflet.base[1];
        const along = (dx * leaflet.direction[0] + dy * leaflet.direction[1]) / leaflet.length;
        if (along < -0.1 || along > 1.1) continue;

        const across = dx * -leaflet.direction[1] + dy * leaflet.direction[0];
        const width = style.width(leaflet, along);

        const value =
          clamp01((width - Math.abs(across)) / EDGE) *
          clamp01((along * leaflet.length) / EDGE) *
          clamp01(((1 - along) * leaflet.length) / EDGE);

        if (value <= 0) continue;
        overlaps++;
        if (value >= coverage) {
          coverage = value;
          best = { leaflet, along, across, width };
        }
      }

      if (!best) continue;

      const i = (rect.y + ly) * width + (rect.x + lx);
      const { leaflet, across, width: leafletWidth } = best;
      const along = best.along;

      const lateral = Math.abs(across) / Math.max(leafletWidth, 0.001);
      const dome = Math.sqrt(Math.max(0, 1 - lateral * lateral));
      const veins = style.veins ? leafVeins(along, across, leafletWidth) : 0;

      // Warped, so the blotching runs with the blade instead of sitting on it
      // as even speckle.
      const [mx, my] = warp(((rect.x + lx) / cell) * 5, ((rect.y + ly) / cell) * 5, 5, 5, params.seed + 5, 0.7);
      const mottle = fbm(mx, my, 5, 5, 3, params.seed + 5);

      // Older tissue at the tip and along the margin, which is where a leaf
      // actually yellows.
      const age = clamp01(along * 0.55 + lateral * 0.45) * mix(0.4, 1, mottle);
      const shade = leaflet.tone * mix(0.66, 1.1, along) * mix(0.84, 1.08, mottle);

      // Within-leaf drift, on top of the per-leaflet hue jitter. A canopy of
      // leaves that are each one flat colour reads as plastic however many
      // different flat colours there are. A leaf cell is square, so this scale
      // is isotropic where the bark's is not.
      const patches = Math.max(1, Math.round(params.colourPatches * 0.6));
      const cx = ((rect.x + lx) / cell) * patches;
      const cy = ((rect.y + ly) / cell) * patches;
      const graded = driftColour(
        [
          tint[0] * shade * (1 + leaflet.hue) + veins * 0.05 + age * 0.14,
          tint[1] * shade + veins * 0.06 + age * 0.08,
          tint[2] * shade * (1 - leaflet.hue * 0.5) + veins * 0.03,
        ],
        cx,
        cy,
        patches,
        patches,
        params.seed + 13,
        params.colourVariation * 0.8
      );

      canvas.albedo[i * 3] = clamp01(graded[0]);
      canvas.albedo[i * 3 + 1] = clamp01(graded[1]);
      canvas.albedo[i * 3 + 2] = clamp01(graded[2]);

      canvas.alpha[i] = coverage;
      // Veins stand proud of the blade, but only just. A leaf is a millimetre
      // thick, and relief past that reads as corrugated plastic once the
      // curvature pass gets hold of it.
      canvas.relief[i] = clamp01(0.34 + 0.38 * dome + 0.1 * veins);
      // Overlapping leaflets sit in each other's shadow, which is the only
      // occlusion a flat card can carry.
      canvas.ao[i] = clamp01((0.78 + 0.22 * dome) * (overlaps > 1 ? 0.86 : 1));
      canvas.roughness[i] = clamp01(
        0.42 + 0.2 * (1 - dome) + roughnessDrift(cx, cy, patches, patches, params.seed + 13, params.roughnessVariation)
      );
      canvas.metallic[i] = 0;
    }
  }
}

/**
 * Darkens where the height template curves inward and bleaches where it curves
 * out, for both halves at once.
 *
 * Relief read from height alone only says how deep a texel is. What the eye
 * actually reads as a surface is curvature: dirt collects in a crevice and wear
 * takes the colour off a ridge, and neither correlates with absolute depth. It
 * is the cheapest thing that makes a generated map stop looking like a tinted
 * heightfield.
 */
function applyCurvature(canvas: Canvas, strength: number, tiles: boolean): void {
  if (strength <= 0) return;

  const { width, height, alpha } = canvas;
  const relief = canvas.relief;

  // A texel with no coverage has no height to compare against, so it lends the
  // centre's own value. Reading its zero instead would ring a bright rim around
  // every leaf, which is the shape of the silhouette, not of the surface.
  const at = (x: number, y: number, centre: number): number => {
    // Bark wraps on both axes now that it owns its image, so its curvature has
    // to read across the seam or every tile gains a rim. A leaf cell must not:
    // the neighbour across the edge is a different leaf.
    if (!tiles && (y < 0 || y >= height)) return centre;
    const j = (((y % height) + height) % height) * width + (((x % width) + width) % width);
    return alpha[j] > 0 ? relief[j] : centre;
  };

  // Neighbouring texels differ by very little, so the Laplacian needs lifting
  // into a usable range before it is clamped.
  const GAIN = 16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha[i] <= 0) continue;

      const centre = relief[i];
      const laplacian =
        4 * centre - (at(x - 1, y, centre) + at(x + 1, y, centre) + at(x, y - 1, centre) + at(x, y + 1, centre));

      const k = Math.max(-1, Math.min(1, laplacian * GAIN));
      const light = 1 + k * strength * 0.45;

      canvas.albedo[i * 3] = clamp01(canvas.albedo[i * 3] * light);
      canvas.albedo[i * 3 + 1] = clamp01(canvas.albedo[i * 3 + 1] * light);
      canvas.albedo[i * 3 + 2] = clamp01(canvas.albedo[i * 3 + 2] * light);
      canvas.ao[i] = clamp01(canvas.ao[i] * (1 - Math.max(0, -k) * strength * 0.6));
    }
  }
}

/**
 * Pushes leaf colour outward under the transparent texels. Without it the mip
 * chain averages the untouched background into every leaf edge, and the
 * silhouette gains a dark fringe that gets worse with distance.
 */
function dilate(canvas: Canvas, rect: PixelRect, passes: number): void {
  const { width: stride } = canvas;
  const filled = new Uint8Array(rect.width * rect.height);

  for (let ly = 0; ly < rect.height; ly++)
    for (let lx = 0; lx < rect.width; lx++)
      filled[ly * rect.width + lx] = canvas.alpha[(rect.y + ly) * stride + (rect.x + lx)] > 0 ? 1 : 0;

  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    let changed = 0;

    for (let ly = 0; ly < rect.height; ly++) {
      for (let lx = 0; lx < rect.width; lx++) {
        if (filled[ly * rect.width + lx]) continue;

        let count = 0;
        const sum: Rgb = [0, 0, 0];

        const neighbours: [number, number][] = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ];

        for (const [ox, oy] of neighbours) {
          const nx = lx + ox;
          const ny = ly + oy;
          if (nx < 0 || ny < 0 || nx >= rect.width || ny >= rect.height) continue;
          if (!filled[ny * rect.width + nx]) continue;

          const j = (rect.y + ny) * stride + (rect.x + nx);
          sum[0] += canvas.albedo[j * 3];
          sum[1] += canvas.albedo[j * 3 + 1];
          sum[2] += canvas.albedo[j * 3 + 2];
          count++;
        }

        if (!count) continue;

        const i = (rect.y + ly) * stride + (rect.x + lx);
        canvas.albedo[i * 3] = sum[0] / count;
        canvas.albedo[i * 3 + 1] = sum[1] / count;
        canvas.albedo[i * 3 + 2] = sum[2] / count;
        next[ly * rect.width + lx] = 1;
        changed++;
      }
    }

    filled.set(next);
    if (!changed) break;
  }
}

/**
 * Sobel over the height field. x wraps because the bark tiles along it; y is
 * clamped, and every clamped row falls inside a gutter no UV addresses.
 */
function encodeNormal(canvas: Canvas, strength: number): Buffer {
  const { width, height: rows, relief } = canvas;
  const out = Buffer.alloc(width * rows * 3);
  // Clamped down the image and wrapped across it, the way the tube samples it.
  const at = (x: number, y: number): number =>
    relief[Math.min(rows - 1, Math.max(0, y)) * width + ((((x % width) + width) % width))];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      let nx = -dx * strength;
      let ny = -dy * strength;
      const length = Math.hypot(nx, ny, 1);
      nx /= length;
      ny /= length;
      const nz = 1 / length;

      const i = (y * width + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }

  return out;
}

function encodeRgba(canvas: Canvas): Buffer {
  const texels = canvas.width * canvas.height;
  const out = Buffer.alloc(texels * 4);

  for (let i = 0; i < texels; i++) {
    out[i * 4] = Math.round(clamp01(canvas.albedo[i * 3]) * 255);
    out[i * 4 + 1] = Math.round(clamp01(canvas.albedo[i * 3 + 1]) * 255);
    out[i * 4 + 2] = Math.round(clamp01(canvas.albedo[i * 3 + 2]) * 255);
    out[i * 4 + 3] = Math.round(clamp01(canvas.alpha[i]) * 255);
  }

  return out;
}

function encodeArm(canvas: Canvas): Buffer {
  const texels = canvas.width * canvas.height;
  const out = Buffer.alloc(texels * 3);

  for (let i = 0; i < texels; i++) {
    out[i * 3] = Math.round(clamp01(canvas.ao[i]) * 255);
    out[i * 3 + 1] = Math.round(clamp01(canvas.roughness[i]) * 255);
    out[i * 3 + 2] = Math.round(clamp01(canvas.metallic[i]) * 255);
  }

  return out;
}

function encodeHeight(canvas: Canvas): Buffer {
  const texels = canvas.width * canvas.height;
  const out = Buffer.alloc(texels * 3);

  for (let i = 0; i < texels; i++) {
    const value = Math.round(clamp01(canvas.relief[i]) * 255);
    out[i * 3] = value;
    out[i * 3 + 1] = value;
    out[i * 3 + 2] = value;
  }

  return out;
}

async function encode(path: string, data: Buffer, width: number, height: number, channels: 3 | 4): Promise<void> {
  // Lossless throughout. The audit refuses lossy data maps because chroma
  // subsampling averages roughness and metallic across 2x2 blocks, and the
  // base colour's alpha is a cutout mask that must not be smeared either.
  await sharp(data, { raw: { width, height, channels } })
    .webp({ lossless: true, effort: 4, alphaQuality: 100 })
    .toFile(path);
}

function namesFor(textureSet: string, piece: string): TextureNames {
  return {
    baseColor: `${textureSet}_${piece}_diff.webp`,
    normal: `${textureSet}_${piece}_nor.webp`,
    arm: `${textureSet}_${piece}_arm.webp`,
    height: `${textureSet}_${piece}_disp.webp`,
  };
}

export function textureFileNames(textureSet: string, pieces: readonly string[]): TextureSetNames {
  return Object.fromEntries(pieces.map((piece) => [piece, namesFor(textureSet, piece)]));
}

/** The bark image as float channels. Split from encoding so the preview can
 *  shade against the same pixels the model will sample. */
export function buildBarkCanvas(params: Params, authored?: BarkSource | null): Canvas {
  if (authored) {
    // Written out in the source's own shape, only ever reduced, so that
    // `textureSize` caps a tile without cropping it or squeezing it into
    // `barkAspect`. The repeating is the mesh's job: see `barkTileOf`.
    const source = fitBark(authored, barkTextureSize(params));
    const canvas = createCanvas(source.width, source.height, normalStrength(source));

    canvas.albedo.set(source.albedo);
    canvas.alpha.fill(1);
    canvas.relief.set(source.relief);
    canvas.ao.set(source.ao);
    canvas.roughness.set(source.roughness);
    canvas.metallic.set(source.metallic);

    // No curvature pass. It exists to stop a generated map reading as a tinted
    // heightfield; authored art already carries where its own light falls, and
    // running it again would darken every crevice twice.
    return canvas;
  }

  const { width, height } = barkCanvasSize(params);
  const canvas = createCanvas(width, height, params.bumpStrength);

  paintBark(canvas, params);
  applyCurvature(canvas, params.curvature, true);

  return canvas;
}

/**
 * The leaf image: a grid of cluster cells, each cut out on alpha.
 *
 * With a source the grid is derived from how many leaves fit a card, and each
 * cell is stamps composited on a spray of sprigs; without one it is the
 * generator's 4x4 of drawn clusters. A config's `leafGrid` overrides either.
 */
export function buildLeafCanvas(params: Params, source?: LeafSource | null): Canvas {
  const size = params.textureSize;
  const gutter = gutterFor(size);

  if (source) {
    const fit = fitLeaves(source, params.leafSize, size, params.leafGrid);
    const cells = leafCellPixels(size, fit.grid);
    const canvas = createCanvas(size, size, fit.bumpStrength ?? params.bumpStrength);

    cells.forEach((rect, index) => {
      const inner = insetRect(rect, gutter);
      const rng = createRng((params.seed ^ 0x51a7e3c9) + index * 7919);
      compositeCluster(canvas, inner, source, clusterFor(rng, inner, source, fit.stampsPerCell, index));
    });

    // No curvature pass, for the same reason the sourced bark skips it.
    for (const rect of cells) dilate(canvas, rect, gutter * 3);
    return canvas;
  }

  const cells = leafCellPixels(size, params.leafGrid || LEAF_GRID_GENERATED);
  const canvas = createCanvas(size, size, params.bumpStrength);

  cells.forEach((rect, index) => paintFoliageCell(canvas, params, rect, index, leafStyle));

  // Before the dilation, so the colour pushed out under the alpha is the colour
  // the leaf edge actually ends up with.
  applyCurvature(canvas, params.curvature, false);

  // Reaches past the gutter, so the dilated colour survives several mip levels.
  for (const rect of cells) dilate(canvas, rect, gutter * 3);

  return canvas;
}

/**
 * A generated tuft: blades fanning from the bottom-middle of the cell.
 *
 * They fan rather than sitting on a rachis, because that is the difference
 * between grass and a leaf. Every blade starts at the same anchor, leans by its
 * own angle and arcs over, and the ones leaning furthest are shortest, which is
 * what stops a fan reading as a paper doily.
 */
function bladesFor(rng: Rng, cell: number, variant: number): Leaflet[] {
  const count = [11, 13, 16, 12, 15, 10, 17, 13][variant % 8];
  const blades: Leaflet[] = [];

  for (let i = 0; i < count; i++) {
    // Spread evenly and then jittered, rather than drawn at random: a random
    // fan clumps on one side often enough to be noticed across sixteen cells.
    const spread = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
    // A narrower fan than looks right in the atlas. The card already leans out
    // by `cardLean` and its base is already offset by `cardSpread`, so the
    // three compound: a 50 degree fan on top of those reads as a splayed
    // starburst rather than as a tuft standing up out of the ground.
    const lean = (spread * 33 + rng.range(-8, 8)) * DEG;

    // A blade leaning hard is a blade seen from the side, so it is shorter and
    // narrower. Without this the fan comes out as a half disc of equal spokes.
    const foreshorten = mix(1, 0.62, Math.abs(spread));

    blades.push({
      // Jittered along the bottom edge rather than all on one point. Blades
      // converging exactly reads as a pinch, and a tuft leaves the ground over
      // a few millimetres.
      base: [cell * (0.5 + spread * 0.06 + rng.range(-0.02, 0.02)), cell * 0.995],
      // -y is up in image space.
      direction: [Math.sin(lean), -Math.cos(lean)],
      length: cell * 0.9 * foreshorten * rng.range(0.82, 1.06),
      // Wide enough to survive the mip chain. A blade a fortieth of the cell
      // across is under a texel by the second mip, and the alpha test then eats
      // what is left — so the tuft thins to nothing a few metres out while the
      // atlas still looks correct.
      halfWidth: cell * 0.055 * foreshorten * rng.range(0.8, 1.25),
      hue: rng.range(-0.07, 0.07),
      tone: rng.range(0.78, 1.18),
    });
  }

  return blades;
}

/**
 * A blade's half width along its length: full at the base, tapering to a point.
 *
 * A leaflet's `sin` profile is wrong here. It narrows at the base as well as
 * the tip, and a blade of grass is widest where it leaves the ground. The
 * exponent keeps most of the width for most of the length, so the taper reads
 * at the tip rather than along the whole blade.
 */
function bladeWidth(shape: Leaflet, along: number): number {
  const t = clamp01(along);
  return shape.halfWidth * (1 - t ** 2.4) * smoothstep(0, 0.05, t);
}

const bladeStyle: StyleFor = (params, rng, rect, variant) => ({
  shapes: bladesFor(rng, cellEdge(rect), variant),
  width: bladeWidth,
  veins: false,
  tint: params.bladeTint,
});

/**
 * The clump atlas: one whole stamp per cell, or generated tufts where none are
 * listed.
 *
 * Only `cells` of the grid are painted. The mesh is handed the same number, so
 * a card never addresses a cell nothing drew.
 */
export function buildBladeCanvas(params: Params, source?: LeafSource | null): Canvas {
  const size = params.textureSize;
  const gutter = gutterFor(size);
  const { grid, cells } = clumpAtlas(source ?? null);
  const rects = leafCellPixels(size, grid).slice(0, cells);

  if (source) {
    const fit = fitClump(source, size);
    const canvas = createCanvas(size, size, gradientGainFor(source, params, fit.cellPx));

    rects.forEach((rect, index) => {
      const inner = insetRect(rect, gutter);
      const rng = createRng((params.seed ^ 0x51a7e3c9) + index * 7919);
      // One stamp per cell, pinned at the bottom-middle and fitted to the cell.
      // `clusterFor` already does exactly that below two stamps per cell, which
      // is the case a clump always is.
      compositeCluster(canvas, inner, source, clusterFor(rng, inner, source, 1, index));
    });

    // No curvature pass, for the same reason the sourced bark skips it.
    for (const rect of rects) dilate(canvas, rect, gutter * 3);
    return canvas;
  }

  const canvas = createCanvas(size, size, params.bumpStrength);

  // Painted into the *inset* rect, unlike a leaf cell. A tuft is anchored on the
  // bottom edge of its cell, and the card samples the cell inset by the gutter,
  // so painting the full rect slices the bases off every blade and leaves the
  // tips floating. A leaf cluster sits in the middle of its cell and never
  // noticed.
  rects.forEach((rect, index) => paintFoliageCell(canvas, params, insetRect(rect, gutter), index, bladeStyle));
  applyCurvature(canvas, params.curvature, false);
  for (const rect of rects) dilate(canvas, rect, gutter * 3);

  return canvas;
}

/** The gain a clump's composited height needs, where its folders declare one. */
function gradientGainFor(source: LeafSource, params: Params, cellPx: number): number {
  return source.depthMetres === null
    ? params.bumpStrength
    : gradientGain(source.depthMetres, source.lengthMetres / Math.max(1, cellPx));
}

/**
 * A generated frond: a rachis up the column with leaflets pinned along it.
 *
 * Pinnate, like the leaf cell's cluster, but at a frond's proportions: many
 * narrow leaflets rather than a few broad ones, angled forward toward the tip,
 * and reaching the column's edge through the middle of the frond so the card
 * is filled. They shorten toward both ends, which is what makes the silhouette
 * a frond and not a bottle brush.
 */
function frondsFor(rng: Rng, rect: PixelRect, variant: number): Leaflet[] {
  const pairs = [18, 22, 20, 24][variant % 4];
  const width = rect.width;
  const height = rect.height;
  const base: [number, number] = [width * 0.5, height * 0.99];
  const tip: [number, number] = [width * (0.5 + rng.range(-0.06, 0.06)), height * 0.03];
  const rachisLength = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
  const rachisDir: [number, number] = [(tip[0] - base[0]) / rachisLength, (tip[1] - base[1]) / rachisLength];
  const shapes: Leaflet[] = [];

  for (let i = 0; i < pairs; i++) {
    const t = 0.06 + (0.9 * i) / Math.max(1, pairs - 1);
    const angle = (48 + rng.range(-10, 10)) * DEG;

    // Full reach through the middle, short at the base and shorter at the tip.
    const envelope = smoothstep(0, 0.22, t) * (1 - 0.6 * smoothstep(0.55, 1, t));
    const reach = (width / 2 / Math.sin(angle)) * envelope * rng.range(0.9, 1.02);

    for (const side of [-1, 1]) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle) * side;
      const along = t + side * 0.012;

      shapes.push({
        base: [mix(base[0], tip[0], along), mix(base[1], tip[1], along)],
        // Rotated off the rachis toward the tip, so the leaflet climbs.
        direction: [rachisDir[0] * cos - rachisDir[1] * sin, rachisDir[0] * sin + rachisDir[1] * cos],
        length: reach,
        // Wide enough to survive the mip chain, as a blade is.
        halfWidth: Math.max(1.5, width * 0.032) * rng.range(0.85, 1.15),
        hue: rng.range(-0.06, 0.06),
        tone: rng.range(0.82, 1.14),
      });
    }
  }

  shapes.push({
    base: [mix(base[0], tip[0], 0.9), mix(base[1], tip[1], 0.9)],
    direction: rachisDir,
    length: rachisLength * 0.1,
    halfWidth: Math.max(1.5, width * 0.03),
    hue: rng.range(-0.04, 0.04),
    tone: rng.range(0.9, 1.1),
  });

  // Drawn last so it sits on top of the leaflet bases.
  shapes.push({
    base,
    direction: rachisDir,
    length: rachisLength * 0.94,
    halfWidth: Math.max(1.2, width * 0.018),
    hue: -0.12,
    tone: 0.86,
    kind: 'rachis',
  });

  return shapes;
}

/** A leaflet tapers to a point like a blade; the rachis only thins toward the tip. */
function frondWidth(shape: Leaflet, along: number): number {
  const t = clamp01(along);
  if (shape.kind === 'rachis') return shape.halfWidth * mix(1, 0.4, t);
  return shape.halfWidth * (1 - t ** 2.2) * smoothstep(0, 0.06, t);
}

const frondStyle: StyleFor = (params, rng, rect, variant) => ({
  shapes: frondsFor(rng, rect, variant),
  width: frondWidth,
  veins: true,
  tint: params.frondTint,
});

/**
 * The frond atlas: one whole frond per cell, or generated fronds where none
 * are listed.
 *
 * Each frond is painted into the centred column of its cell that a card of
 * `cardAspect` samples, so it lands on the card at the proportion it was
 * drawn at. A sourced stamp stands at its own aspect and is clipped by the
 * card's edge where it is wider — the run reports that.
 */
export function buildFrondCanvas(params: Params, source?: LeafSource | null): Canvas {
  const size = params.textureSize;
  const gutter = gutterFor(size);
  const { grid, cells } = crownAtlas(source ?? null);
  const rects = leafCellPixels(size, grid).slice(0, cells);

  if (source) {
    const fit = fitCrown(source, size);
    const canvas = createCanvas(size, size, gradientGainFor(source, params, fit.cellPx));

    rects.forEach((rect, index) => {
      const inner = insetRect(rect, gutter);
      const rng = createRng((params.seed ^ 0x51a7e3c9) + index * 7919);
      compositeCluster(canvas, inner, source, clusterFor(rng, inner, source, 1, index));
    });

    for (const rect of rects) dilate(canvas, rect, gutter * 3);
    return canvas;
  }

  const canvas = createCanvas(size, size, params.bumpStrength);

  // Painted into the column the card samples, inset like a blade's cell so the
  // base is not sliced off at the gutter.
  rects.forEach((rect, index) =>
    paintFoliageCell(canvas, params, columnPixels(insetRect(rect, gutter), params.cardAspect), index, frondStyle)
  );
  applyCurvature(canvas, params.curvature, false);
  for (const rect of rects) dilate(canvas, rect, gutter * 3);

  return canvas;
}

export function buildClumpCanvases(params: Params, blades?: LeafSource | null): Canvases {
  return { blade: buildBladeCanvas(params, blades) };
}

export function buildTreeCanvases(params: Params, bark?: BarkSource | null, leaves?: LeafSource | null): Canvases {
  return { bark: buildBarkCanvas(params, bark), leaf: buildLeafCanvas(params, leaves) };
}

/** A crown's images: the frond atlas, and bark only while there is a stem to wear it. */
export function buildCrownCanvases(
  params: Params,
  hasStem: boolean,
  bark?: BarkSource | null,
  fronds?: LeafSource | null
): Canvases {
  return {
    ...(hasStem ? { bark: buildBarkCanvas(params, bark) } : {}),
    frond: buildFrondCanvas(params, fronds),
  };
}

/**
 * One piece's maps.
 *
 * `_disp` is written only where the piece asks for it. glTF has no
 * displacement slot and the engine builds no heightMap from a file, so the map
 * is dead weight wherever the relief it records is under a millimetre. A
 * blade's is. Bark's is kept because bark is the one surface a displacement
 * path would ever be wired for.
 */
function encodeOne(directory: string, names: TextureNames, canvas: Canvas, withHeight: boolean): Promise<void>[] {
  const { width, height } = canvas;

  return [
    encode(join(directory, names.baseColor), encodeRgba(canvas), width, height, 4),
    encode(join(directory, names.normal), encodeNormal(canvas, canvas.bumpStrength), width, height, 3),
    encode(join(directory, names.arm), encodeArm(canvas), width, height, 3),
    ...(withHeight ? [encode(join(directory, names.height), encodeHeight(canvas), width, height, 3)] : []),
  ];
}

export async function writeTextureSet(
  params: Params,
  directory: string,
  canvases: Canvases,
  heightPieces: readonly string[]
): Promise<TextureSetNames> {
  await mkdir(directory, { recursive: true });
  const names = textureFileNames(params.textureSet, Object.keys(canvases));

  await Promise.all(
    Object.entries(canvases).flatMap(([piece, canvas]) =>
      encodeOne(directory, names[piece], canvas, heightPieces.includes(piece))
    )
  );

  return names;
}

/**
 * What a texture set's leaf image was painted for. Written beside the images
 * so a variant that reuses them can be checked against the grid its cards
 * will address: the grid follows leafSize, and a card cut for a different
 * grid samples cells nothing drew.
 */
export interface SetManifest {
  leafGrid: number;
  leafSize: number;
  /**
   * Cells the atlas actually painted, where that is fewer than `leafGrid`
   * squared. A clump atlas sizes its grid to hold its stamps, so ten stamps
   * land in a 4x4 with six cells left blank, and a card hashing into one of
   * those would draw nothing. Absent on a set written before clumps, which is
   * a tree, whose grid is always full.
   */
  cells?: number;
}

function manifestPath(directory: string, textureSet: string): string {
  return join(directory, `${textureSet}.textures.json`);
}

export async function writeSetManifest(directory: string, textureSet: string, manifest: SetManifest): Promise<void> {
  await writeFile(manifestPath(directory, textureSet), `${JSON.stringify(manifest, null, 2)}
`);
}

/** Null where the set was written before manifests were, or not yet at all. */
export async function readSetManifest(directory: string, textureSet: string): Promise<SetManifest | null> {
  let text: string;
  try {
    text = await readFile(manifestPath(directory, textureSet), 'utf8');
  } catch {
    return null;
  }

  const parsed = JSON.parse(text) as Partial<SetManifest>;
  if (typeof parsed.leafGrid !== 'number' || typeof parsed.leafSize !== 'number')
    throw new Error(`${manifestPath(directory, textureSet)} does not name a leafGrid and a leafSize.`);
  return {
    leafGrid: parsed.leafGrid,
    leafSize: parsed.leafSize,
    cells: typeof parsed.cells === 'number' ? parsed.cells : parsed.leafGrid * parsed.leafGrid,
  };
}
