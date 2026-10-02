import { smoothstep } from 'rewild-common';

// A gale pushes back on a player walking into it. Walking within HEADWIND_FULL
// of straight into the wind takes the full drag, easing out by
// HEADWIND_EDGE either side; the drag ramps in from GALE_START windiness and
// slows the player to 1 − HEADWIND_SLOW of their speed in full wind. Its
// gusts shove the player downwind whatever they do, up to GUST_PUSH metres a
// second at a full gale's strongest, enough to carry them off a ridge.

/** Windiness 0..1 at which the wind starts to hold the player back. */
export const GALE_START = 0.8;
/** Share of the speed a full gale takes from a player walking into it. */
export const HEADWIND_SLOW = 0.55;
/** Metres a second the strongest gust of a full gale shoves a player
 *  downwind. */
export const GUST_PUSH = 4;
/** Seconds a shove takes to build or ease off, by e. */
export const GUST_PUSH_EASE = 0.3;
const HEADWIND_FULL = (20 * Math.PI) / 180;
const HEADWIND_EDGE = (45 * Math.PI) / 180;

/**
 * The share of the walking speed left to a player moving along (`moveX`,
 * `moveZ`) against air moving along (`airX`, `airZ`) at `windiness` 0..1.
 */
export function headwindSpeedShare(
  moveX: number,
  moveZ: number,
  airX: number,
  airZ: number,
  windiness: number
): number {
  const move = Math.hypot(moveX, moveZ);
  const air = Math.hypot(airX, airZ);
  if (move < 1e-6 || air < 1e-6) return 1;
  const into = -(moveX * airX + moveZ * airZ) / (move * air);
  const facing = smoothstep(
    into,
    Math.cos(HEADWIND_EDGE),
    Math.cos(HEADWIND_FULL)
  );
  const gale = smoothstep(windiness, GALE_START, 1);
  return 1 - HEADWIND_SLOW * facing * gale;
}

/** Metres a second the gust shoves a player downwind: `gust` 0..1 how hard
 *  it blows where they stand (gustShare), at `windiness` 0..1. */
export function gustPushSpeed(gust: number, windiness: number): number {
  return (
    GUST_PUSH *
    Math.min(1, Math.max(0, gust)) *
    smoothstep(windiness, GALE_START, 1)
  );
}

/** The shove `push` m/s eased toward `target` over `seconds`. */
export function easeGustPush(
  push: number,
  target: number,
  seconds: number
): number {
  return push + (target - push) * (1 - Math.exp(-seconds / GUST_PUSH_EASE));
}
