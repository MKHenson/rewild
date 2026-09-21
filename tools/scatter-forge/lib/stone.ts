// The stone image: six cube charts, every texel a point on the rock's own
// surface. Nothing here reads a UV. A texel is mapped to a direction, the
// direction to a surface point, and the grain, the cracks and the weathering
// are all functions of that point and its normal — which is why a crack runs
// into a chart's gutter and out the neighbouring chart without a break.

import { fbm3, smoothstep, worley3Into, type Worley3Result } from './noise.ts';
import type { Params } from './params.ts';
import { platesInto, type PlateSample } from './plates.ts';
import {
  crackMask,
  cubePoint,
  FACES,
  ROCK_CHART_COLUMNS,
  ROCK_CHART_ROWS,
  ROCK_GUTTER,
  rockChartPx,
  surfaceAt,
  type RockField,
} from './rock.ts';
import { createCanvas, type Canvas, type Canvases } from './textures.ts';
import type { Vec3 } from './vec.ts';

type Rgb = [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function parseHex(value: string, field: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`${field} must be a six digit hex colour, got '${value}'.`);
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Every look value the painter reads, parsed once. */
interface Palette {
  mid: Rgb;
  dark: Rgb;
  light: Rgb;
  lichen: Rgb;
  soil: Rgb;
}

function paletteOf(params: Params): Palette {
  return {
    mid: parseHex(params.stoneTint, 'stoneTint'),
    dark: parseHex(params.stoneDark, 'stoneDark'),
    light: parseHex(params.stoneLight, 'stoneLight'),
    lichen: parseHex(params.lichenTint, 'lichenTint'),
    soil: parseHex(params.soilTint, 'soilTint'),
  };
}

/** One chart's surface, before anything is painted on it. */
interface Surface {
  /** xyz per texel, in the rock's centred space. */
  points: Float32Array;
  /** Distance from the centre per texel. */
  radius: Float32Array;
}

const _c: Vec3 = [0, 0, 0];
const _p: Vec3 = [0, 0, 0];

/**
 * The surface under every texel of one chart, gutter included. A gutter texel
 * is a face coordinate just past 0..1, which is a direction just past the
 * face's edge: the neighbouring face's own surface, in this chart's frame.
 */
function sampleSurface(field: RockField, faceIndex: number, chartPx: number): Surface {
  const face = FACES[faceIndex];
  const inner = chartPx - ROCK_GUTTER * 2;
  const points = new Float32Array(chartPx * chartPx * 3);
  const radius = new Float32Array(chartPx * chartPx);

  for (let y = 0; y < chartPx; y++) {
    const b = (y - ROCK_GUTTER + 0.5) / inner;
    for (let x = 0; x < chartPx; x++) {
      const a = (x - ROCK_GUTTER + 0.5) / inner;
      surfaceAt(_p, field, cubePoint(_c, face, a, b));
      const i = y * chartPx + x;
      points[i * 3] = _p[0];
      points[i * 3 + 1] = _p[1];
      points[i * 3 + 2] = _p[2];
      radius[i] = Math.hypot(_p[0], _p[1], _p[2]);
    }
  }

  return { points, radius };
}

const _du: Vec3 = [0, 0, 0];
const _dv: Vec3 = [0, 0, 0];

/** Central differences over the texel grid, one-sided at the chart's border. */
function normalOf(into: Vec3, surface: Surface, chartPx: number, x: number, y: number): Vec3 {
  const { points } = surface;
  const xa = Math.max(0, x - 1);
  const xb = Math.min(chartPx - 1, x + 1);
  const ya = Math.max(0, y - 1);
  const yb = Math.min(chartPx - 1, y + 1);

  const ia = (y * chartPx + xa) * 3;
  const ib = (y * chartPx + xb) * 3;
  _du[0] = points[ib] - points[ia];
  _du[1] = points[ib + 1] - points[ia + 1];
  _du[2] = points[ib + 2] - points[ia + 2];

  const ja = (ya * chartPx + x) * 3;
  const jb = (yb * chartPx + x) * 3;
  _dv[0] = points[jb] - points[ja];
  _dv[1] = points[jb + 1] - points[ja + 1];
  _dv[2] = points[jb + 2] - points[ja + 2];

  const nx = _du[1] * _dv[2] - _du[2] * _dv[1];
  const ny = _du[2] * _dv[0] - _du[0] * _dv[2];
  const nz = _du[0] * _dv[1] - _du[1] * _dv[0];
  const length = Math.hypot(nx, ny, nz) || 1;
  into[0] = nx / length;
  into[1] = ny / length;
  into[2] = nz / length;
  return into;
}

/**
 * How sharply the surface bends at a texel, from the radius of its neighbours
 * `reach` texels away: positive on a ridge or a cleave crease, negative in a
 * hollow. Scaled by the texel spacing so a crease of a given angle reads the
 * same at any resolution.
 */
function curvatureOf(surface: Surface, chartPx: number, x: number, y: number, reach: number): number {
  const { radius } = surface;
  const xa = Math.max(0, x - reach);
  const xb = Math.min(chartPx - 1, x + reach);
  const ya = Math.max(0, y - reach);
  const yb = Math.min(chartPx - 1, y + reach);
  const centre = radius[y * chartPx + x];
  const sum = radius[y * chartPx + xa] + radius[y * chartPx + xb] + radius[ya * chartPx + x] + radius[yb * chartPx + x];
  const spacing = (2 / (chartPx - ROCK_GUTTER * 2)) * reach;
  return (4 * centre - sum) / (centre * spacing);
}

const _worley: Worley3Result = { f1: 0, f2: 0, id: 0 };

// Half the range an octave sum occupies, by octave count, as `noise.ts` measures it.
const TONE_SPREAD = [0.29, 0.29, 0.2, 0.17, 0.16, 0.155];

/**
 * An octave sum as a 0..1 tone: centred, widened to the range it occupies,
 * then pulled toward the middle by how little contrast is wanted.
 */
function toneOf(sum: number, octaves: number, contrast: number): number {
  const spread = TONE_SPREAD[Math.min(5, octaves)] ?? 0.15;
  const centred = Math.tanh(((sum - 0.5) / spread) * 0.9);
  return 0.5 + centred * 0.5 * contrast;
}

/** Dark to mid over the lower half of `t`, mid to light over the upper. */
function ramp(dark: number, mid: number, light: number, t: number): number {
  return t < 0.5 ? mix(dark, mid, t * 2) : mix(mid, light, (t - 0.5) * 2);
}

/** The coarse crack field alone, for the march that finds cracks above a texel. */
function crackAbove(field: RockField, x: number, y: number, z: number): number {
  const w = worley3Into(_worley, x * field.cracks, y * field.cracks, z * field.cracks, field.seed ^ 0x2545f491);
  return 1 - smoothstep(0, 0.08, w.f2 - w.f1);
}

const DRIP_STEPS = 6;

const _n: Vec3 = [0, 0, 0];
const _plate: PlateSample = { height: 0, id: 0 };

function paintChart(canvas: Canvas, params: Params, field: RockField, palette: Palette, faceIndex: number): void {
  const chartPx = rockChartPx(params);
  const surface = sampleSurface(field, faceIndex, chartPx);
  const column = faceIndex % ROCK_CHART_COLUMNS;
  const row = Math.floor(faceIndex / ROCK_CHART_COLUMNS);
  const stride = canvas.width;
  const weathering = params.weathering;
  const toneScale = 1 / params.toneSize;
  const toneOctaves = params.toneOctaves;
  const toneContrast = params.toneContrast;
  const grainScale = params.grainScale;
  const speckle = params.speckle;
  const radius = (field.extents[0] + field.extents[1] + field.extents[2]) / 3;
  const height = field.extents[1] * 2;
  const dripStep = radius * 0.035;

  for (let y = 0; y < chartPx; y++) {
    for (let x = 0; x < chartPx; x++) {
      const i = y * chartPx + x;
      const px = surface.points[i * 3];
      const py = surface.points[i * 3 + 1];
      const pz = surface.points[i * 3 + 2];
      normalOf(_n, surface, chartPx, x, y);
      const crease = curvatureOf(surface, chartPx, x, y, 1);
      const hollow = curvatureOf(surface, chartPx, x, y, 8);

      // Tone: an octave stack ramped dark to light through the mid tint. This
      // is the mottling every rock has under its detail. Each slab of the pile
      // shifts it by its own value, so no two plates are one grey, and the
      // pile's bevels go into the height for the normal map to find.
      let tone = toneOf(fbm3(px * toneScale, py * toneScale, pz * toneScale, toneOctaves, field.seed ^ 0x7f4a7c15), toneOctaves, toneContrast);
      let slab = 0.5;
      if (field.plates) {
        platesInto(_plate, field.plates, px, py, pz);
        tone = clamp01(tone + (_plate.id - 0.5) * params.plateTint);
        slab = _plate.height;
      }
      let r = ramp(palette.dark[0], palette.mid[0], palette.light[0], tone);
      let g = ramp(palette.dark[1], palette.mid[1], palette.light[1], tone);
      let b = ramp(palette.dark[2], palette.mid[2], palette.light[2], tone);
      let roughness = 0.78 + (tone - 0.5) * 0.2;
      let ao = 1;
      let relief = 0.5 + (tone - 0.5) * 0.35 + (slab - 0.5) * 0.5 * field.plateShare;

      // Speckle: the mineral flecks, thresholded off a finer stack.
      if (speckle > 0) {
        const grain = fbm3(px * grainScale, py * grainScale, pz * grainScale, 3, field.seed ^ 0x2b9f7e3d);
        const fleckDark = smoothstep(0.43, 0.37, grain) * speckle;
        const fleckLight = smoothstep(0.59, 0.65, grain) * speckle;
        r = mix(mix(r, palette.dark[0], fleckDark), palette.light[0], fleckLight);
        g = mix(mix(g, palette.dark[1], fleckDark), palette.light[1], fleckLight);
        b = mix(mix(b, palette.dark[2], fleckDark), palette.light[2], fleckLight);
        roughness += (fleckLight - fleckDark) * 0.15;
        relief += (grain - 0.5) * 0.25 * speckle;
      }

      // Cracks: dark, deep, dusty.
      const crack = crackMask(field, px, py, pz, params.crackWidth) * params.crackStrength;
      r *= 1 - 0.6 * crack;
      g *= 1 - 0.6 * crack;
      b *= 1 - 0.6 * crack;
      relief -= crack * params.crackDepth * 0.5;
      ao *= 1 - 0.6 * crack;
      roughness += 0.15 * crack;

      // Edge wear: a ridge is rain-rounded, lighter and smoother; a hollow
      // holds dirt.
      const ridge = smoothstep(0.15, 0.6, crease);
      const dirt = weathering * Math.max(smoothstep(0.15, 0.6, -crease), smoothstep(0.1, 0.5, -hollow) * 0.7);
      r *= 1 + 0.18 * ridge;
      g *= 1 + 0.18 * ridge;
      b *= 1 + 0.18 * ridge;
      roughness -= 0.12 * ridge;
      r = mix(r, palette.soil[0], dirt * 0.5);
      g = mix(g, palette.soil[1], dirt * 0.5);
      b = mix(b, palette.soil[2], dirt * 0.5);
      roughness += 0.1 * dirt;
      ao *= 1 - 0.25 * dirt;

      // Exposure: lichen where the face looks at the sky, in patches.
      const patches = smoothstep(0.5, 0.62, fbm3(px * 4, py * 4, pz * 4, 3, field.seed ^ 0x6a09e667));
      const lichen = weathering * smoothstep(0.25, 0.85, _n[1]) * patches * 0.7;
      r = mix(r, palette.lichen[0], lichen);
      g = mix(g, palette.lichen[1], lichen);
      b = mix(b, palette.lichen[2], lichen);
      roughness += 0.1 * lichen;

      // Drip stains: darker below a crack on a side face.
      if (weathering > 0 && field.cracks > 0 && params.crackStrength > 0 && _n[1] > -0.3 && _n[1] < 0.7) {
        let above = 0;
        for (let step = 1; step <= DRIP_STEPS; step++)
          above = Math.max(above, crackAbove(field, px, py + step * dripStep, pz) * (1 - step / (DRIP_STEPS + 1)));
        const stain = weathering * above * params.crackStrength * 0.35;
        r *= 1 - stain;
        g *= 1 - stain;
        b *= 1 - stain;
        roughness += 0.1 * stain;
      }

      // Ground contact: soil and moss climb the lowest part.
      const contact = weathering * smoothstep(0.25, 0, (py - field.base) / height);
      r = mix(r, palette.soil[0], contact * 0.6);
      g = mix(g, palette.soil[1], contact * 0.6);
      b = mix(b, palette.soil[2], contact * 0.6);
      roughness += 0.12 * contact;

      const texel = (row * chartPx + y) * stride + column * chartPx + x;
      canvas.albedo[texel * 3] = clamp01(r);
      canvas.albedo[texel * 3 + 1] = clamp01(g);
      canvas.albedo[texel * 3 + 2] = clamp01(b);
      canvas.alpha[texel] = 1;
      canvas.relief[texel] = clamp01(relief);
      canvas.ao[texel] = clamp01(ao);
      canvas.roughness[texel] = clamp01(roughness);
      canvas.metallic[texel] = 0;
    }
  }
}

/** The stone image as float channels: six charts in a 3x2 image. */
export function buildStoneCanvas(params: Params, field: RockField): Canvas {
  const chartPx = rockChartPx(params);
  const canvas = createCanvas(chartPx * ROCK_CHART_COLUMNS, chartPx * ROCK_CHART_ROWS, params.bumpStrength);
  const palette = paletteOf(params);

  for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) paintChart(canvas, params, field, palette, faceIndex);

  return canvas;
}

export function buildRockCanvases(params: Params, field: RockField): Canvases {
  return { stone: buildStoneCanvas(params, field) };
}
