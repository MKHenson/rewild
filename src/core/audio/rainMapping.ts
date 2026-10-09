import { smoothstep } from 'rewild-common';

/** Rain strength (rainShare) at which the rain bed is at full gain. */
export const RAIN_FULL_AT = 0.4;

/** Rain strength over which the light loop crossfades into the heavy one. */
export const RAIN_HEAVY_FROM = 0.55;
export const RAIN_HEAVY_AT = 0.7;

/** The rain bed's gain with the heavy loop alone, so a downpour leaves room for the wind. */
export const RAIN_HEAVY_LEVEL = 0.35;

/** Rain strength above which the drips are lost under the rain. */
export const DRIPS_RAIN_HIDES = 0.15;

/** The rain bed's cutoff in a drizzle and in a downpour. It opens as rain gets heavier. */
const RAIN_CUTOFF_LIGHT = 5000;
const RAIN_CUTOFF_HEAVY = 20000;

/** The rain bed's gain: silent with no rain, full from `RAIN_FULL_AT`, and
 *  down to `RAIN_HEAVY_LEVEL` as the heavy loop takes over. */
export function rainGain(rain: number): number {
  const level = 1 + (RAIN_HEAVY_LEVEL - 1) * rainBlend(rain);
  return Math.min(1, Math.max(0, rain) / RAIN_FULL_AT) * level;
}

/** The rain bed's layer blend: 0 is the light loop alone, 1 the heavy loop alone. */
export function rainBlend(rain: number): number {
  return smoothstep(rain, RAIN_HEAVY_FROM, RAIN_HEAVY_AT);
}

/** The rain bed's low-pass cutoff in Hz: soft in a drizzle, bright in a downpour. */
export function rainCutoff(rain: number): number {
  const r = Math.min(1, Math.max(0, rain));
  return RAIN_CUTOFF_LIGHT * Math.pow(RAIN_CUTOFF_HEAVY / RAIN_CUTOFF_LIGHT, r);
}

/**
 * The drips bed's gain: the wet film left on the world (RainWetness.film),
 * heard once the rain has eased off, and fading as the world dries.
 */
export function dripsGain(film: number, rain: number): number {
  const f = Math.min(1, Math.max(0, film));
  return f * (1 - smoothstep(rain, 0, DRIPS_RAIN_HIDES));
}
