import { smoothstep } from 'rewild-common';

/** The fastest fall, in Player.verticalVelocity's units, where air drag
 *  balances gravity: about 120 m a second. */
export const TERMINAL_FALL = 60;

/** Fall speed, in Player.verticalVelocity's units, at which the air starts to
 *  rush past and at which it is full: about 20 m and 150 m into a drop. */
export const FREEFALL_FROM = 20;
export const FREEFALL_FULL = 45;

/**
 * `velocity` (Player.verticalVelocity) after `dt` of `gravity`, negative. A
 * fall is held back by drag that grows with the square of its speed, easing it
 * to TERMINAL_FALL. Rising is not dragged.
 */
export function fallStep(velocity: number, gravity: number, dt: number): number {
  if (velocity >= 0) return velocity + gravity * dt;
  const share = velocity / TERMINAL_FALL;
  return Math.max(
    -TERMINAL_FALL,
    velocity + gravity * dt * (1 - share * share)
  );
}

/** 0..1: how hard the air rushes past a player falling at `fallSpeed`,
 *  downward. A jump or a short drop stays at 0. */
export function freefallShare(fallSpeed: number): number {
  return smoothstep(fallSpeed, FREEFALL_FROM, FREEFALL_FULL);
}
