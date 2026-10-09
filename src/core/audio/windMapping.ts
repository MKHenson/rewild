import { smoothstep } from 'rewild-common';

/** The windiness each air loop matches, calm to windy, in manifest order. */
export const AIR_LAYER_AT: readonly number[] = [0.1, 0.55, 0.8];

/** Windiness at which the roar in the ears starts, as the lens blur does. */
export const EARS_START = 0.8;

/** Windiness below which gusts are not loud enough to hear on their own. */
export const GUST_SHOT_START = 0.25;

/** The air bed's cutoff in calm and in a gale. It opens as the wind rises. */
const AIR_CUTOFF_CALM = 1500;
const AIR_CUTOFF_GALE = 18000;

/** How much a full gust lifts the air bed, at full wind. */
const AIR_GUST_SWELL = 0.35;

/** The roar in the ears between gusts, as a share of its full level. */
const EARS_GUST_CALM = 0.4;

/**
 * The air bed's layer blend for `windiness`: 0 is the first loop alone, 1 the
 * second and so on, with each loop alone at its `at` and a crossfade between.
 */
export function airBlend(
  windiness: number,
  at: readonly number[] = AIR_LAYER_AT
): number {
  if (windiness <= at[0]) return 0;
  for (let i = 1; i < at.length; i++)
    if (windiness < at[i])
      return i - 1 + (windiness - at[i - 1]) / (at[i] - at[i - 1]);
  return at.length - 1;
}

/** The air bed's gain: the windiness, from silent in still air to full in a gale, lifted further by a gust. */
export function airGain(windiness: number, gust: number): number {
  const w = Math.min(1, Math.max(0, windiness));
  return Math.min(1, w * (1 + AIR_GUST_SWELL * gust * w));
}

/** The air bed's low-pass cutoff in Hz: dull in calm, harsh in a gale. */
export function airCutoff(windiness: number): number {
  const w = Math.min(1, Math.max(0, windiness));
  return AIR_CUTOFF_CALM * Math.pow(AIR_CUTOFF_GALE / AIR_CUTOFF_CALM, w);
}

/**
 * The roar in the ears: none below `EARS_START`, full facing into a gale, and
 * swelling with the gust `envelope`. `facing` is windFacing: 1 looking where
 * the wind comes from, 0 with your back to it.
 */
export function earsGain(
  windiness: number,
  facing: number,
  envelope: number
): number {
  return (
    smoothstep(windiness, EARS_START, 1) *
    facing *
    (EARS_GUST_CALM + (1 - EARS_GUST_CALM) * envelope)
  );
}

/** A gust one-shot's gain at `windiness`: silent below `GUST_SHOT_START`. */
export function gustShotGain(windiness: number): number {
  return smoothstep(windiness, GUST_SHOT_START, 1);
}
