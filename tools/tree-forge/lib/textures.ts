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
import { gutterFor, insetRect, leafCellPixels, type PixelRect } from './atlas.ts';
import {
  fitLeaves,
  LEAF_GRID_GENERATED,
  normalStrength,
  tileRepeats,
  type BarkSource,
  type LeafSource,
} from './sources.ts';
import { barkStack, createSample, sampleBark } from './bark.ts';
import { clusterFor, compositeCluster } from './cluster.ts';
import { fbm, signedFbm, warp } from './noise.ts';
import { createRng, type Rng } from './rng.ts';
import type { Params } from './params.ts';

/** The atlas as float channels, before any of it is quantised or encoded. */
export interface Canvas {
  size: number;
  /** The gradient gain this canvas's own height needs to become a normal. A
   *  sourced image derives it from the depth the source declares; a generated
   *  one takes the settled value. */
  bumpStrength: number;
  /** Three floats a texel, in display space. */
  albedo: Float32Array;
  alpha: Float32Array;
  height: Float32Array;
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

/** Both images a tree references. Separate because they are separate
 *  materials — see the header of atlas.ts. */
export interface TextureSetNames {
  bark: TextureNames;
  leaves: TextureNames;
}

/** Both images as float channels. */
export interface Canvases {
  bark: Canvas;
  leaves: Canvas;
}

type Rgb = [number, number, number];

interface Leaflet {
  base: [number, number];
  direction: [number, number];
  length: number;
  halfWidth: number;
  hue: number;
  tone: number;
}

// The bounds a 4-octave sum of this noise actually spans, measured rather than
// assumed. Thresholds outside them are the difference between a flag that does
// nothing and one that covers the whole trunk.
const LICHEN_CLEAR = 0.78;
const LICHEN_DENSE = 0.3;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scaleRgb = (c: Rgb, s: number): Rgb => [c[0] * s, c[1] * s, c[2] * s];

function desaturate(c: Rgb, amount: number): Rgb {
  const grey = luminance(c);
  return mixRgb(c, [grey, grey, grey], amount);
}

/** Blends across an ordered palette by a single 0..1 position. */
function paletteAt(entries: Rgb[], t: number): Rgb {
  const scaled = clamp01(t) * (entries.length - 1);
  const index = Math.min(entries.length - 2, Math.floor(scaled));
  return mixRgb(entries[index], entries[index + 1], scaled - index);
}

/**
 * Bark is never one colour. A trunk is warm brown where it is fresh, grey where
 * it has weathered, and greener where damp, in patches metres across. Ramping a
 * single tint by depth varies brightness alone, which is the most reliable tell
 * that a texture was generated.
 */
function barkPalette(tint: Rgb): Rgb[] {
  // Kept close together on purpose. These are weathering states of one bark,
  // not three different materials, and a wide palette reads as a stain rather
  // than as a trunk.
  return [
    [Math.min(1, tint[0] * 1.08), tint[1] * 0.98, tint[2] * 0.92],
    scaleRgb(desaturate(tint, 0.3), 1.05),
    scaleRgb(desaturate([tint[0] * 0.94, tint[1] * 1, tint[2] * 0.98], 0.12), 0.88),
  ];
}

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

function createCanvas(size: number, bumpStrength: number): Canvas {
  const texels = size * size;
  return {
    size,
    bumpStrength,
    albedo: new Float32Array(texels * 3),
    alpha: new Float32Array(texels),
    height: new Float32Array(texels),
    ao: new Float32Array(texels).fill(1),
    roughness: new Float32Array(texels).fill(0.8),
    metallic: new Float32Array(texels),
  };
}

function paintBark(canvas: Canvas, params: Params): void {
  const { size } = canvas;
  const seed = params.seed | 0;
  const palette = barkPalette(parseHex(params.barkTint, 'bark-tint'));
  const lichenColour = parseHex(params.lichenTint, 'lichen-tint');

  // Colour patches run along the branch, so they are broader in u than in v,
  // the same way the plates are. Both periods stay integers because the lattice
  // wraps on whole cells.
  const PATCH_Y = params.colourPatches;
  const PATCH_X = Math.max(1, Math.round(params.colourPatches * 0.4));

  // Built once and run per texel. One sample, reused: the band is half a
  // million texels and a stack touches it several times at each.
  const stack = barkStack(params, seed);
  const sample = createSample();

  // Length runs down the image and the ring across it, which is the way bark
  // sources are authored and so the way the assembler will want to write them.
  // Both axes span the whole image and both wrap, so there is no gutter and no
  // edge: the ring closes across x and the tile repeats down y.
  for (let y = 0; y < size; y++) {
    const fu = y / size;

    for (let x = 0; x < size; x++) {
      const fv = x / size;

      sampleBark(stack, sample, fu, fv);
      let h = sample.height;
      const { cavity, grain, plate, wear: knotCore } = sample;

      // Which colour this patch of trunk is. Deliberately low frequency: the
      // eye reads patches of a different hue, and fine colour noise only fights
      // the normal map and then averages away in the mip chain anyway.
      const [rx, ry] = warp(fu * 2, fv * 3, 2, 3, seed + 71, 0.6);
      // Plate to plate on top of that. Weathering is per plate because a plate
      // is what is exposed as a unit, and it is the cue that says these are
      // separate pieces of bark rather than one dented surface.
      const base = paletteAt(palette, clamp01(fbm(rx, ry, 2, 3, 3, seed + 71) + (plate - 0.5) * 0.5));

      // Depth alone decides how dark a fissure goes, because colour is ramped
      // by height. This lifts the floor independently, so a groove can be deep
      // without being a black line.
      const crevice = scaleRgb(base, params.grooveShade);
      const ridge: Rgb = [
        Math.min(1, base[0] * 1.38 + 0.06),
        Math.min(1, base[1] * 1.38 + 0.06),
        Math.min(1, base[2] * 1.38 + 0.06),
      ];

      const i = y * size + x;
      // Keyed on cavity rather than on height. Height only says how deep a
      // texel is, and a plate sitting low is not a crevice — shading from it
      // alone is what leaves a generated map looking like a tinted heightfield.
      const shade = clamp01(1 - cavity) ** 0.75;
      const tone = mix(0.88, 1.12, plate) * mix(0.88, 1.12, grain);

      const graded = driftColour(
        [
          mix(crevice[0], ridge[0], shade) * tone,
          mix(crevice[1], ridge[1], shade) * tone,
          mix(crevice[2], ridge[2], shade) * tone,
        ],
        fu * PATCH_X,
        fv * PATCH_Y,
        PATCH_X,
        PATCH_Y,
        seed,
        params.colourVariation
      );

      let [red, green, blue] = graded;

      // Dead heartwood in the middle of a healed knot, darker than the bark
      // that grew over it.
      if (knotCore > 0) {
        const stain = knotCore * params.knotDepth * 0.9;
        red = mix(red, red * 0.34, stain);
        green = mix(green, green * 0.28, stain);
        blue = mix(blue, blue * 0.26, stain);
      }

      let roughness = 0.94 - 0.18 * h;
      // Occlusion is what a fissure does to the light reaching its floor, so it
      // follows how enclosed a texel is and not how low it sits.
      let occlusion = clamp01(1 - 0.72 * cavity);

      if (params.lichen > 0) {
        // Grows on the outer face rather than down in the fissures, and holds
        // its own roughness: lichen is matt where the bark under it is not.
        const [lx, ly] = warp(fu * 3, fv * 6, 3, 6, seed + 97, 0.85);

        // An octave sum clusters hard around its mean and reaches neither 0 nor
        // 1, so a threshold picked by eye either covers everything or nothing.
        // The band below sits inside the distribution this actually produces,
        // and lichen slides it, which is what makes the flag mean coverage.
        const start = mix(LICHEN_CLEAR, LICHEN_DENSE, clamp01(params.lichen));
        const patch = smoothstep(start, start + 0.09, fbm(lx, ly, 3, 6, 4, seed + 97));
        const cover = patch * (1 - smoothstep(0.15, 0.6, cavity)) * 0.85;

        red = mix(red, lichenColour[0] * mix(0.75, 1.15, grain), cover);
        green = mix(green, lichenColour[1] * mix(0.75, 1.15, grain), cover);
        blue = mix(blue, lichenColour[2] * mix(0.75, 1.15, grain), cover);
        roughness = mix(roughness, 0.97, cover);
        occlusion = mix(occlusion, occlusion * 0.94, cover);
        h = clamp01(h + cover * 0.04);
      }

      canvas.albedo[i * 3] = clamp01(red);
      canvas.albedo[i * 3 + 1] = clamp01(green);
      canvas.albedo[i * 3 + 2] = clamp01(blue);
      canvas.alpha[i] = 1;
      canvas.height[i] = h;
      canvas.ao[i] = occlusion;
      canvas.roughness[i] = clamp01(roughness + roughnessDrift(fu * 2, fv * 5, 2, 5, seed, params.roughnessVariation));
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

function paintLeafCell(canvas: Canvas, params: Params, rect: PixelRect, variant: number): void {
  const { size } = canvas;
  const cell = Math.min(rect.width, rect.height);
  const rng = createRng((params.seed ^ 0x2f6b1e3d) + variant * 7919);
  const tint = parseHex(params.leafTint, 'leaf-tint');
  const leaflets = leafletsFor(rng, cell, variant);

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
        const width = leafletWidth(leaflet, along, params, variant);

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

      const i = (rect.y + ly) * size + (rect.x + lx);
      const { leaflet, across, width } = best;
      const along = best.along;

      const lateral = Math.abs(across) / Math.max(width, 0.001);
      const dome = Math.sqrt(Math.max(0, 1 - lateral * lateral));
      const veins = leafVeins(along, across, width);

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
      canvas.height[i] = clamp01(0.34 + 0.38 * dome + 0.1 * veins);
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

  const { size, alpha } = canvas;
  const height = canvas.height;

  // A texel with no coverage has no height to compare against, so it lends the
  // centre's own value. Reading its zero instead would ring a bright rim around
  // every leaf, which is the shape of the silhouette, not of the surface.
  const at = (x: number, y: number, centre: number): number => {
    // Bark wraps on both axes now that it owns its image, so its curvature has
    // to read across the seam or every tile gains a rim. A leaf cell must not:
    // the neighbour across the edge is a different leaf.
    if (!tiles && (y < 0 || y >= size)) return centre;
    const j = (((y % size) + size) % size) * size + (((x % size) + size) % size);
    return alpha[j] > 0 ? height[j] : centre;
  };

  // Neighbouring texels differ by very little, so the Laplacian needs lifting
  // into a usable range before it is clamped.
  const GAIN = 16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (alpha[i] <= 0) continue;

      const centre = height[i];
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
  const { size } = canvas;
  const filled = new Uint8Array(rect.width * rect.height);

  for (let ly = 0; ly < rect.height; ly++)
    for (let lx = 0; lx < rect.width; lx++)
      filled[ly * rect.width + lx] = canvas.alpha[(rect.y + ly) * size + (rect.x + lx)] > 0 ? 1 : 0;

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

          const j = (rect.y + ny) * size + (rect.x + nx);
          sum[0] += canvas.albedo[j * 3];
          sum[1] += canvas.albedo[j * 3 + 1];
          sum[2] += canvas.albedo[j * 3 + 2];
          count++;
        }

        if (!count) continue;

        const i = (rect.y + ly) * size + (rect.x + lx);
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
  const { size, height } = canvas;
  const out = Buffer.alloc(size * size * 3);
  const at = (x: number, y: number): number => height[Math.min(size - 1, Math.max(0, y)) * size + ((x % size) + size) % size];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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

      const i = (y * size + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }

  return out;
}

function encodeRgba(canvas: Canvas): Buffer {
  const { size } = canvas;
  const out = Buffer.alloc(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    out[i * 4] = Math.round(clamp01(canvas.albedo[i * 3]) * 255);
    out[i * 4 + 1] = Math.round(clamp01(canvas.albedo[i * 3 + 1]) * 255);
    out[i * 4 + 2] = Math.round(clamp01(canvas.albedo[i * 3 + 2]) * 255);
    out[i * 4 + 3] = Math.round(clamp01(canvas.alpha[i]) * 255);
  }

  return out;
}

function encodeArm(canvas: Canvas): Buffer {
  const { size } = canvas;
  const out = Buffer.alloc(size * size * 3);

  for (let i = 0; i < size * size; i++) {
    out[i * 3] = Math.round(clamp01(canvas.ao[i]) * 255);
    out[i * 3 + 1] = Math.round(clamp01(canvas.roughness[i]) * 255);
    out[i * 3 + 2] = Math.round(clamp01(canvas.metallic[i]) * 255);
  }

  return out;
}

function encodeHeight(canvas: Canvas): Buffer {
  const { size } = canvas;
  const out = Buffer.alloc(size * size * 3);

  for (let i = 0; i < size * size; i++) {
    const value = Math.round(clamp01(canvas.height[i]) * 255);
    out[i * 3] = value;
    out[i * 3 + 1] = value;
    out[i * 3 + 2] = value;
  }

  return out;
}

async function encode(path: string, data: Buffer, size: number, channels: 3 | 4): Promise<void> {
  // Lossless throughout. The audit refuses lossy data maps because chroma
  // subsampling averages roughness and metallic across 2x2 blocks, and the
  // base colour's alpha is a cutout mask that must not be smeared either.
  await sharp(data, { raw: { width: size, height: size, channels } })
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

export function textureFileNames(textureSet: string): TextureSetNames {
  return { bark: namesFor(textureSet, 'bark'), leaves: namesFor(textureSet, 'leaf') };
}

/**
 * Lays a source tile across the bark image, repeated to its declared size.
 *
 * Bilinear and wrapped, so the repeat count does not have to divide the image
 * evenly and the tile's own edges keep meeting.
 */
function paintBarkFromSource(canvas: Canvas, source: BarkSource, repeats: number): void {
  const { size } = canvas;
  const n = source.size;

  for (let y = 0; y < size; y++) {
    const sy = (y / size) * repeats * n;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    const ay = ((y0 % n) + n) % n;
    const by = (ay + 1) % n;

    for (let x = 0; x < size; x++) {
      const sx = (x / size) * repeats * n;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const ax = ((x0 % n) + n) % n;
      const bx = (ax + 1) % n;

      const i00 = ay * n + ax;
      const i10 = ay * n + bx;
      const i01 = by * n + ax;
      const i11 = by * n + bx;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const blend = (channel: Float32Array): number =>
        channel[i00] * w00 + channel[i10] * w10 + channel[i01] * w01 + channel[i11] * w11;

      const i = y * size + x;
      for (let c = 0; c < 3; c++)
        canvas.albedo[i * 3 + c] =
          source.albedo[i00 * 3 + c] * w00 +
          source.albedo[i10 * 3 + c] * w10 +
          source.albedo[i01 * 3 + c] * w01 +
          source.albedo[i11 * 3 + c] * w11;

      canvas.alpha[i] = 1;
      canvas.ao[i] = blend(source.ao);
      canvas.roughness[i] = blend(source.roughness);
      canvas.metallic[i] = blend(source.metallic);
      canvas.height[i] = blend(source.height);
    }
  }
}

/** The bark image as float channels. Split from encoding so the preview can
 *  shade against the same pixels the model will sample. */
export function buildBarkCanvas(params: Params, source?: BarkSource | null): Canvas {
  if (source) {
    const repeats = tileRepeats(source, params.trunkRadius);
    const canvas = createCanvas(params.textureSize, normalStrength(source, repeats, params.textureSize));
    paintBarkFromSource(canvas, source, repeats);
    // No curvature pass. It exists to stop a generated map reading as a tinted
    // heightfield; authored art already carries where its own light falls, and
    // running it again would darken every crevice twice.
    return canvas;
  }

  const canvas = createCanvas(params.textureSize, params.bumpStrength);

  paintBark(canvas, params);
  applyCurvature(canvas, params.curvature, true);

  return canvas;
}

/**
 * The leaf image: a grid of cluster cells, each cut out on alpha.
 *
 * With a source the grid is derived from how many leaves fit a card, and each
 * cell is stamps composited on a spray of sprigs; without one it is the
 * generator's 4x4 of drawn clusters.
 */
export function buildLeafCanvas(params: Params, source?: LeafSource | null): Canvas {
  const size = params.textureSize;
  const gutter = gutterFor(size);

  if (source) {
    const fit = fitLeaves(source, params.leafSize, size);
    const cells = leafCellPixels(size, fit.grid);
    const canvas = createCanvas(size, fit.bumpStrength ?? params.bumpStrength);

    cells.forEach((rect, index) => {
      const inner = insetRect(rect, gutter);
      const rng = createRng((params.seed ^ 0x51a7e3c9) + index * 7919);
      compositeCluster(canvas, inner, source, clusterFor(rng, inner, source, fit.stampsPerCell, index));
    });

    // No curvature pass, for the same reason the sourced bark skips it.
    for (const rect of cells) dilate(canvas, rect, gutter * 3);
    return canvas;
  }

  const cells = leafCellPixels(size, LEAF_GRID_GENERATED);
  const canvas = createCanvas(size, params.bumpStrength);

  cells.forEach((rect, index) => paintLeafCell(canvas, params, rect, index));

  // Before the dilation, so the colour pushed out under the alpha is the colour
  // the leaf edge actually ends up with.
  applyCurvature(canvas, params.curvature, false);

  // Reaches past the gutter, so the dilated colour survives several mip levels.
  for (const rect of cells) dilate(canvas, rect, gutter * 3);

  return canvas;
}

export function buildCanvases(params: Params, bark?: BarkSource | null, leaves?: LeafSource | null): Canvases {
  return { bark: buildBarkCanvas(params, bark), leaves: buildLeafCanvas(params, leaves) };
}

function encodeOne(directory: string, names: TextureNames, canvas: Canvas): Promise<void>[] {
  const size = canvas.size;

  return [
    encode(join(directory, names.baseColor), encodeRgba(canvas), size, 4),
    encode(join(directory, names.normal), encodeNormal(canvas, canvas.bumpStrength), size, 3),
    encode(join(directory, names.arm), encodeArm(canvas), size, 3),
    encode(join(directory, names.height), encodeHeight(canvas), size, 3),
  ];
}

export async function writeTextureSet(
  params: Params,
  directory: string,
  canvases: Canvases = buildCanvases(params)
): Promise<TextureSetNames> {
  await mkdir(directory, { recursive: true });
  const names = textureFileNames(params.textureSet);

  await Promise.all([
    ...encodeOne(directory, names.bark, canvases.bark),
    ...encodeOne(directory, names.leaves, canvases.leaves),
  ]);

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
  return { leafGrid: parsed.leafGrid, leafSize: parsed.leafSize };
}
