// How water moves the player. Wading slows them with the water's depth over
// their feet. Shoulder deep they swim: gravity gives way to floating with the
// eye just above the surface, so the waves carry them. A swimmer dives and
// rises at will, and holds the height they stop at, above the bed; stopped near
// the surface, they float again. Depths are measured against the eye's height
// above the feet, so they follow the player's body.

/** Metres below the eye the water stands when the player starts to swim. */
export const SWIM_BELOW_EYE = 0.6;
/** Metres shallower than the swim depth a swimmer stands again, so the switch
 *  does not flicker on a wave. */
export const SWIM_LEAVE_MARGIN = 0.2;
/** Metres of water over the feet before wading slows the player. */
export const WADE_START = 0.1;
/** Share of the walking speed left at the swim depth. */
export const WADE_SLOWEST = 0.6;
/** Share of the walking speed a swimmer moves at. */
export const SWIM_SPEED_SHARE = 0.8;
/** Metres the eye floats above the surface. */
export const SWIM_EYE_ABOVE = 0.2;
/** Per second: how fast a swimmer closes on the height they hold. */
export const FLOAT_RATE = 3;
/** Per second: how fast water takes a falling or rising player's speed. */
export const WATER_DRAG = 3;
/** Metres a second a swimmer dives or rises. */
export const DIVE_SPEED = 1.5;
export const RISE_SPEED = 1.5;
/** Metres below the floating height within which a swimmer who stops diving
 *  floats again. */
export const FLOAT_SNAP = 0.4;
/** Metres the eye keeps above the lowest it can reach over the bed. */
export const BED_CLEARANCE = 0.1;

/** Metres of water over the feet at which a player whose eye stands
 *  `eyeAboveFeet` metres above them swims. */
export function swimDepth(eyeAboveFeet: number): number {
  return eyeAboveFeet - SWIM_BELOW_EYE;
}

/** Whether a player with `immersion` metres of water over the feet swims. */
export function isSwimming(
  wasSwimming: boolean,
  immersion: number,
  eyeAboveFeet: number
): boolean {
  const depth = swimDepth(eyeAboveFeet);
  return immersion >= (wasSwimming ? depth - SWIM_LEAVE_MARGIN : depth);
}

/** Share of the walking speed left wading `immersion` metres deep. */
export function wadeSpeedShare(
  immersion: number,
  eyeAboveFeet: number
): number {
  const t = (immersion - WADE_START) / (swimDepth(eyeAboveFeet) - WADE_START);
  return 1 - (1 - WADE_SLOWEST) * Math.min(1, Math.max(0, t));
}

/** Metres a swimmer whose eye is at `eyeY` moves up over `seconds` toward
 *  holding it at `target`. */
export function swimStep(
  eyeY: number,
  target: number,
  seconds: number
): number {
  return (target - eyeY) * (1 - Math.exp(-FLOAT_RATE * seconds));
}

/**
 * The eye height a submerged swimmer holds after `seconds`, or NaN when they
 * float. `held` is the height they held, NaN while floating; `eyeY` where
 * their eye is now. `down` dives and `up` rises. `level` is the water's level
 * at rest and `floor` the lowest the eye may go above the bed. A swimmer who
 * is not diving and is within FLOAT_SNAP of the floating height floats.
 */
export function holdHeight(
  held: number,
  eyeY: number,
  down: boolean,
  up: boolean,
  seconds: number,
  level: number,
  floor: number
): number {
  let next = held;
  if (down) next = (Number.isNaN(next) ? eyeY : next) - DIVE_SPEED * seconds;
  if (Number.isNaN(next)) return NaN;
  if (up) next += RISE_SPEED * seconds;
  next = Math.max(next, floor);
  if (!down && next >= level + SWIM_EYE_ABOVE - FLOAT_SNAP) return NaN;
  return next;
}

/** A vertical speed after `seconds` in water. */
export function waterDrag(velocity: number, seconds: number): number {
  return velocity * Math.exp(-WATER_DRAG * seconds);
}
