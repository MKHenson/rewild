import type { Collider, Ray, RigidBody, World } from '@dimforge/rapier3d-compat';
import { smoothstep } from 'rewild-common';

type Rapier = typeof import('@dimforge/rapier3d-compat');

// Ground steeper than SLIDE_START starts to carry the player downhill, the pull
// ramping up to the full share of gravity along the slope by SLIDE_FULL. The
// slide bleeds off by SLIDE_FRICTION on gentler ground, so a slide skids to a
// stop at the bottom, and keeps its momentum in the air, so a steep face can
// throw the player off it.

const DEG = Math.PI / 180;
/** Steepest slope the player can walk up or jump from. */
export const MAX_SLOPE_CLIMB = 45 * DEG;
const WALKABLE_NORMAL_Y = Math.cos(MAX_SLOPE_CLIMB);
const WALKABLE_TAN = Math.tan(MAX_SLOPE_CLIMB);
// Snapping follows the ground down slopes up to this steep; anything sheerer
// is a drop the player falls off.
const MAX_SNAP_TAN = Math.tan(70 * DEG);
// Extra snap reach beyond the drop of the slope over one frame's step.
const SNAP_MARGIN = 0.1;
// Reach of the ground-normal ray from the capsule centre; covers the capsule
// base resting on slopes up to ~80°.
const GROUND_PROBE_REACH = 4.0;
/** Slope angle at which the ground starts to pull the player downhill. */
export const SLIDE_START = 35 * DEG;
/** Slope angle from which the full share of gravity pulls the player. */
export const SLIDE_FULL = 45 * DEG;
/** Gravity the slide accelerates under, scaled by the slope's sine. */
export const SLIDE_GRAVITY = 9.81;
/** Rate by e a second a slide bleeds off on ground too gentle to slide on. */
export const SLIDE_FRICTION = 3;
/** Fastest a slide carries the player. */
export const SLIDE_MAX_SPEED = 14;

/** How strongly ground with up-normal component `normalY` slides, 0..1. */
export function slideRamp(normalY: number): number {
  const angle = Math.acos(Math.min(1, Math.max(-1, normalY)));
  return smoothstep(angle, SLIDE_START, SLIDE_FULL);
}

/** Downhill acceleration on ground with up-normal component `normalY`. */
export function slideAccel(normalY: number): number {
  const sin = Math.sqrt(Math.max(0, 1 - normalY * normalY));
  return SLIDE_GRAVITY * sin * slideRamp(normalY);
}

/** Slide speed `speed` after `seconds` of friction at slide `ramp` 0..1. */
export function slideFriction(
  speed: number,
  ramp: number,
  seconds: number
): number {
  return speed * Math.exp(-SLIDE_FRICTION * (1 - ramp) * seconds);
}

/**
 * How far along the downhill direction (`downX`, `downZ`, unit length) to
 * push walking input (`moveX`, `moveZ`) so it cannot climb ground sliding at
 * `ramp` 0..1; walking across or down the slope is left alone.
 */
export function uphillCancel(
  moveX: number,
  moveZ: number,
  downX: number,
  downZ: number,
  ramp: number
): number {
  const along = moveX * downX + moveZ * downZ;
  return along < 0 ? -along * ramp : 0;
}

/**
 * The player's footing on slopes: the ground normal underfoot and the slide it
 * drives. Call `probe` after each move, then `step` with the next frame's
 * walking input and read the result from `moveX`/`moveZ`.
 */
export class GroundSlide {
  /** Up-facing normal of the ground underfoot; straight up off the ground. */
  normalX = 0;
  normalY = 1;
  normalZ = 0;
  /** Horizontal slide velocity. */
  velocityX = 0;
  velocityZ = 0;
  /** Horizontal move from the last `step`: walking input plus the slide. */
  moveX = 0;
  moveZ = 0;
  private _ray: Ray | null = null;

  /** Whether the ground underfoot is gentle enough to walk up or jump from. */
  get walkable(): boolean {
    return this.normalY >= WALKABLE_NORMAL_Y;
  }

  /** Drops the slide and footing, e.g. after a teleport. */
  reset(): void {
    this._flat();
    this.velocityX = 0;
    this.velocityZ = 0;
  }

  /**
   * Reads the ground normal under the capsule centre at (`x`, `y`, `z`);
   * straight up when not `onGround` or when the ray finds nothing.
   */
  probe(
    R: Rapier,
    world: World,
    collider: Collider,
    body: RigidBody,
    onGround: boolean,
    x: number,
    y: number,
    z: number
  ): void {
    this._flat();
    if (!onGround) return;

    if (!this._ray)
      this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const ray = this._ray;
    ray.origin.x = x;
    ray.origin.y = y;
    ray.origin.z = z;

    const hit = world.castRayAndGetNormal(
      ray,
      GROUND_PROBE_REACH,
      true,
      R.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      collider,
      body
    );
    if (!hit || hit.normal.y <= 0) return;
    this.normalX = hit.normal.x;
    this.normalY = hit.normal.y;
    this.normalZ = hit.normal.z;
  }

  /**
   * Advances the slide by `dt` (`seconds` real time) and folds it into the
   * walking input (`moveX`, `moveZ`). Steep ground pulls the player downhill
   * and won't let them walk up it; the slide bleeds off on gentler ground and
   * carries on through the air. An inactive slide (swimming, no gravity) stops.
   */
  step(
    moveX: number,
    moveZ: number,
    onGround: boolean,
    active: boolean,
    dt: number,
    seconds: number
  ): void {
    if (!active) {
      this.velocityX = 0;
      this.velocityZ = 0;
    } else if (onGround) {
      const ramp = slideRamp(this.normalY);
      const downLen = Math.hypot(this.normalX, this.normalZ);
      if (ramp > 0 && downLen > 1e-6) {
        const downX = this.normalX / downLen;
        const downZ = this.normalZ / downLen;
        const accel = slideAccel(this.normalY) * dt;
        this.velocityX += downX * accel;
        this.velocityZ += downZ * accel;
        const cancel = uphillCancel(moveX, moveZ, downX, downZ, ramp);
        moveX += downX * cancel;
        moveZ += downZ * cancel;
      }
      const speed = Math.hypot(this.velocityX, this.velocityZ);
      if (speed > 1e-6) {
        const eased = Math.min(
          slideFriction(speed, ramp, seconds),
          SLIDE_MAX_SPEED
        );
        this.velocityX *= eased / speed;
        this.velocityZ *= eased / speed;
      }
    }
    this.moveX = moveX + this.velocityX * dt;
    this.moveZ = moveZ + this.velocityZ * dt;
  }

  /** How far down to snap after a horizontal step of `stepLength`, so the
   *  player follows the ground underfoot rather than stepping off it. */
  snapDistance(stepLength: number): number {
    const ny = this.normalY;
    const groundTan = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
    const snapTan = Math.min(Math.max(groundTan, WALKABLE_TAN), MAX_SNAP_TAN);
    return stepLength * snapTan + SNAP_MARGIN;
  }

  private _flat(): void {
    this.normalX = 0;
    this.normalY = 1;
    this.normalZ = 0;
  }
}
