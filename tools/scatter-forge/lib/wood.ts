// Generated bark: one wood pattern, tinted.
//
// A domain-warped ridged fractal, and nothing else. It replaces a stack of
// layers — plates, crust, knots, grain, lift — that cost 5.7 seconds a map and
// existed to model bark as a structure. This models it as a surface instead,
// which is all a fallback has to do: art that matters is authored, and a
// `bark` source still goes through its own path untouched.
//
// Two departures from the shader this is taken from, both forced:
//
// **It has to tile.** The original hashes unbounded coordinates, which is fine
// for one screen and useless here: x wraps around the ring and y repeats along
// the branch, so every field is sampled on the periodic lattice in `noise.ts`
// and the octave lacunarity is 2 rather than 2.2, because a fractional one
// lands the wrap mid-cell.
//
// **The grain runs along the branch on purpose.** In the original that came
// from a slip — the vertical coordinate was built from the horizontal one — and
// it is the reason the picture reads as wood at all. Here it is two cell
// counts: many around the ring, few along the branch.

import { valueNoise } from './noise.ts';
import type { Params } from './params.ts';

/** Coarsest-octave cells around the ring. Fissures are cut across these. */
const AROUND = 12;

/**
 * Coarsest-octave cells along the branch, per circumference of length.
 *
 * Far fewer than around, which is the whole anisotropy: a fissure is a long
 * feature up the trunk and a narrow one across it. It is multiplied by
 * `barkAspect`, as every along-axis count is, so a taller map covers more
 * trunk rather than drawing the same bark stretched over it.
 */
const ALONG = 2;

const OCTAVES = 5;
const GAIN = 0.62;

/** How sharply a ridge collapses into a crevice. Higher is deeper and narrower. */
const RIDGE = 0.5;

/** Cells of sideways displacement, which is what stops the fissures running straight. */
const WARP = 4;

/** Measured percentile anchors: these put the 5th at 0.05 and the 95th at 0.95. */
const LIFT = 0.26;
const STRETCH = 1.15;

/** The pattern, 0 at the bottom of a crevice and 1 on an exposed ridge. */
export function woodAt(params: Params, around: number, along: number): number {
  const seed = params.seed | 0;
  const cellsAlong = ALONG * params.barkAspect;

  // Two fields, each displacing one axis. One field displacing both would shear
  // the pattern rather than wander it, and the fissures would stay parallel.
  const warpAround =
    (valueNoise(around * 3, along * cellsAlong, 3, cellsAlong, seed + 11) -
      0.5) *
    2;
  const warpAlong =
    (valueNoise(around * 2, along * cellsAlong, 2, cellsAlong, seed + 23) -
      0.5) *
    2;

  let x = around * AROUND + warpAround * WARP;
  let y = along * cellsAlong + warpAlong * WARP;

  let periodX = AROUND;
  let periodY = cellsAlong;
  let sum = 0;
  let total = 0;
  let amplitude = 1;

  for (let octave = 0; octave < OCTAVES; octave++) {
    // Ridged: the zero crossings of a signed field become the creases, and the
    // exponent pinches them. Summing ridges is what makes a fissure run
    // unbroken through the finer detail instead of being chopped up by it.
    const signed =
      valueNoise(x, y, periodX, periodY, seed + octave * 131) * 2 - 1;
    sum += (1 - Math.abs(signed)) ** RIDGE * amplitude;
    total += amplitude;

    amplitude *= GAIN;
    x *= 2;
    y *= 2;
    periodX *= 2;
    periodY *= 2;
  }

  // Lifted and stretched onto 0..1, from where the sum actually sits rather
  // than from where it looks like it should. At `RIDGE` 2 the raw field runs
  // 0.18 at the 5th percentile to 0.75 at the 95th and centres near 0.45, so
  // an eyeballed lift leaves the whole image down in the crevice colour: the
  // first cut of this had a median of 0.27 and read as black with veins.
  return Math.min(1, Math.max(0, (sum / total - LIFT) * STRETCH));
}
