import { smoothstep } from 'rewild-common';

/** Rate, per second, at which the eye eases to a new posture's height: about
 *  a quarter of a second to crouch, stand or settle into a swim. */
export const EYE_EASE_RATE = 12;

/** Metres a second² the head falls at as the body collapses: from standing
 *  and still, it reaches the ground in about 0.6 s. */
export const COLLAPSE_ACCELERATION = 8.6;

/** Fastest the head keeps falling from a fatal landing, in metres a second;
 *  the crumpling legs take the rest. */
export const COLLAPSE_SPEED_MAX = 8;

/** Metres above the feet the eye rests at once the body lies on the ground. */
export const LYING_EYE_ABOVE_FEET = 0.25;

/** Radians the head rolls onto its side as the body falls. */
export const COLLAPSE_ROLL = 1.3;

/** Share of the drop the head bounces back up on landing, and how quickly
 *  the bounce settles. */
const BOUNCE = 0.06;
const BOUNCE_FREQUENCY = 14;
const BOUNCE_DAMPING = 9;

/** The eye's height after `seconds` easing from `eye` towards `target`. */
export function easeEye(eye: number, target: number, seconds: number): number {
  return target + (eye - target) * Math.exp(-EYE_EASE_RATE * seconds);
}

/**
 * Seconds a collapsing head takes to fall `drop` metres to the ground,
 * already falling at `speed` metres a second as the body gives way.
 */
export function collapseTime(drop: number, speed: number): number {
  const v = Math.min(Math.max(0, speed), COLLAPSE_SPEED_MAX);
  const a = COLLAPSE_ACCELERATION;
  return (Math.sqrt(v * v + 2 * a * Math.max(0, drop)) - v) / a;
}

/**
 * 0..1: how far down a collapsing head has dropped `t` seconds in, for a
 * collapse taking `time` seconds that starts falling at `speed`. Slow as the
 * knees give from still, quick from a fatal landing; it then bounces once and
 * settles.
 */
export function collapseShare(t: number, time: number, speed: number): number {
  if (t <= 0) return 0;
  if (t < time) {
    const v = Math.min(Math.max(0, speed), COLLAPSE_SPEED_MAX);
    const a = 0.5 * COLLAPSE_ACCELERATION;
    return (t * (v + a * t)) / (time * (v + a * time));
  }
  const after = t - time;
  return (
    1 -
    BOUNCE *
      Math.exp(-BOUNCE_DAMPING * after) *
      Math.sin(BOUNCE_FREQUENCY * after)
  );
}

/** 0..1: how far a head collapsing over `time` seconds has rolled onto its side `t` seconds in. */
export function collapseRoll(t: number, time: number): number {
  return smoothstep(t, 0.15 * time, time);
}

/** Radians a body floating on the water rocks side to side and nods. */
const FLOAT_ROCK = 0.09;
const FLOAT_NOD = 0.05;

/** Radians a body floating `t` seconds rocks onto its side. */
export function floatRock(t: number): number {
  return FLOAT_ROCK * Math.sin(1.7 * t);
}

/** Radians a body floating `t` seconds nods its head. */
export function floatNod(t: number): number {
  return FLOAT_NOD * Math.sin(1.1 * t + 1);
}
