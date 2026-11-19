// Generated kelp art: one blade per strip, and the stalk tile.
//
// A blade is a ribbon that narrows to a short stalk at its base and rounds or
// frays at its tip, olive brown fading to gold toward the tip. The midrib, the
// blistered corrugation and the pale crust of growth on older tissue are what
// tell it from a plain strap. Kelp is wet, so both surfaces are glossy.

import type { PixelRect } from './atlas.ts';
import { smoothstep, valueNoise } from './noise.ts';
import type { Params } from './params.ts';
import { createRng } from './rng.ts';
import type { Canvas } from './textures.ts';

type Rgb = [number, number, number];

/** What growth on old tissue bleaches toward. */
const EPIPHYTE: Rgb = [0.79, 0.76, 0.66];
/** Roughness of wet tissue. */
const WET_ROUGHNESS = 0.38;
/** Lattice cells along a blade the noise is read at. */
const NOISE_CELLS = 64;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function parseTint(value: string, key: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`${key} must be a six digit hex colour, got '${value}'.`);
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function noise(x: number, y: number, seed: number): number {
  return valueNoise(x, y, 1 << 16, 1 << 16, seed);
}

/** Two octaves of value noise, 0..1. */
function noise2(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.65 + noise(x * 2.3 + 17, y * 2.3 + 5, seed + 1) * 0.35;
}

/**
 * Half the blade's width at `t` along it, as a fraction of the strip: a short
 * stalk at the base, flaring to full width by a quarter of the way, then
 * rounding off toward the tip.
 */
function bladeProfile(t: number): number {
  const stalk = 0.12 + 0.88 * smoothstep(0.02, 0.24, t);
  const tip = Math.sqrt(clamp01(1 - smoothstep(0.7, 1, t) * 0.92));
  return stalk * tip * smoothstep(0, 0.02, t);
}

/** One generated blade into the column of `rect` a card samples. */
export function paintKelpBlade(canvas: Canvas, params: Params, rect: PixelRect, variant: number): void {
  const rng = createRng((params.seed ^ 0x1f83d9ab) + variant * 7919);
  const base = parseTint(params.kelpTint, 'kelpTint');
  const tip = parseTint(params.kelpTipTint, 'kelpTipTint');
  const tone = 1 + rng.range(-1, 1) * params.colourVariance;
  const hue = rng.range(-1, 1) * params.colourVariance * 0.5;
  const seed = (params.seed ^ 0x3c6ef372) + variant * 131;
  const waves = params.bladeRuffleWaves;
  const halfPx = rect.width / 2;
  const centre = rect.x + halfPx;

  for (let y = 0; y < rect.height; y++) {
    const t = 1 - (y + 0.5) / rect.height;
    const tipWear = params.fray * smoothstep(0.65, 1, t);
    for (let x = 0; x < rect.width; x++) {
      const s = (rect.x + x + 0.5 - centre) / halfPx;
      const gx = s * 4;
      const gy = t * NOISE_CELLS;

      // The edge wavers with the ruffles and is eaten into toward the tip.
      const edgeWave = 1 + 0.05 * Math.sin(t * waves * Math.PI * 2 + (s > 0 ? 1.7 : 0));
      const wear = params.fray * smoothstep(0.55, 1, t) * noise2(gx * 0.8, gy * 0.7, seed + 7);
      const half = bladeProfile(t) * edgeWave * (1 - wear * 0.8);
      const edge = (half - Math.abs(s)) * halfPx;
      const hole = tipWear > 0 && noise2(gx * 2, gy * 1.4, seed + 11) > 1 - tipWear * 0.35;
      const alpha = hole ? 0 : clamp01(edge + 0.5);
      if (alpha <= 0) continue;

      const i = (rect.y + y) * canvas.width + rect.x + x;
      const ramp = t ** 1.3;
      const patch = (noise2(gx * 0.5, gy * 0.25, seed + 3) - 0.5) * params.colourVariance * 1.6;
      const shade = tone * (1 + patch);

      const midrib = params.midrib * Math.exp(-((s / 0.07) ** 2)) * smoothstep(0.02, 0.15, t);
      const bulla = 0.5 + 0.5 * Math.sin(gy * 0.9 + noise(gx * 0.6, gy * 0.15, seed + 5) * 4 - Math.abs(s) * 2);
      const corrugation = params.corrugation * bulla * (1 - 0.5 * Math.abs(s)) * smoothstep(0.1, 0.3, t);
      const crust =
        params.epiphytes * (1 - smoothstep(0.15, 0.7, t)) * smoothstep(0.62, 0.72, noise2(gx * 1.6, gy * 0.9, seed + 13));

      for (let c = 0; c < 3; c++) {
        let value = mix(base[c], tip[c], ramp) * shade;
        if (c === 0) value *= 1 + hue;
        if (c === 2) value *= 1 - hue;
        value *= 1 - 0.28 * midrib - 0.12 * corrugation;
        value = mix(value, EPIPHYTE[c], crust);
        canvas.albedo[i * 3 + c] = clamp01(value);
      }

      canvas.alpha[i] = alpha;
      canvas.relief[i] = clamp01(0.45 + 0.3 * corrugation + 0.2 * midrib + 0.25 * crust);
      canvas.ao[i] = clamp01(1 - 0.25 * (1 - bulla) * params.corrugation);
      canvas.roughness[i] = clamp01(WET_ROUGHNESS + 0.4 * crust);
      canvas.metallic[i] = 0;
    }
  }
}

/**
 * The stalk tile: streaks running along the stalk, wrapped once around it and
 * repeating along it, so it covers the floats and the holdfast too.
 */
export function paintStipe(canvas: Canvas, params: Params): void {
  const { width, height } = canvas;
  const tint = parseTint(params.stipeTint, 'stipeTint');
  const seed = params.seed ^ 0x5bd1e995;
  const around = 6;
  const along = 6 * (height / width);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = (x / width) * around;
      const v = (y / height) * along;
      const streak = valueNoise(u * 3, v * 0.5, around * 3, along * 0.5, seed);
      const mottle = valueNoise(u, v, around, along, seed + 1);
      const shade = 1 + (streak - 0.5) * 0.35 + (mottle - 0.5) * params.colourVariance * 1.4;
      const i = y * width + x;
      for (let c = 0; c < 3; c++) canvas.albedo[i * 3 + c] = clamp01(tint[c] * shade);
      canvas.alpha[i] = 1;
      canvas.relief[i] = clamp01(0.5 + (streak - 0.5) * 0.4);
      canvas.ao[i] = 1;
      canvas.roughness[i] = clamp01(WET_ROUGHNESS + (mottle - 0.5) * 0.1);
      canvas.metallic[i] = 0;
    }
}
