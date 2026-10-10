import type {
  Collider,
  Ray,
  RigidBody,
  World,
} from '@dimforge/rapier3d-compat';
import { smoothstep } from 'rewild-common';

type Rapier = typeof import('@dimforge/rapier3d-compat');

// Ground steeper than SLIDE_START starts to carry the player downhill, the pull
// ramping up to the full share of gravity along the slope by SLIDE_FULL. The
// slide bleeds off by SLIDE_FRICTION on gentler ground, so a slide skids to a
// stop at the bottom, and keeps its momentum in the air, so a steep face can
// throw the player off it.
//
// Slippery ground, `slip` 0..1 from the terrain's materials, starts a slide on
// gentler slopes, bleeds it off slower, skids the player's walking and takes
// the harm out of the slide itself; what a slide carries the player into
// still hurts.

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
/** The same on fully slippery ground. */
export const SLIDE_START_SLIPPERY = 15 * DEG;
/** Slope angle from which the full share of gravity pulls the player. */
export const SLIDE_FULL = 45 * DEG;
/** Gravity the slide accelerates under, scaled by the slope's sine. */
export const SLIDE_GRAVITY = 9.81;
/** Rate by e a second a slide bleeds off on ground too gentle to slide on. */
export const SLIDE_FRICTION = 3;
/** Share of SLIDE_FRICTION fully slippery ground takes away. */
export const SLIP_FRICTION_CUT = 0.97;
/** Rate by e a second walking on fully slippery ground catches up with the keys. */
export const WALK_GRIP = 0.8;
/** Fastest a slide carries the player. */
export const SLIDE_MAX_SPEED = 14;
/** Slide speed from which sliding on the ground starts to hurt. */
export const SLIDE_HURT_FROM = 9;
/** Health a second a slide at SLIDE_MAX_SPEED takes. */
export const SLIDE_HURT_RATE = 20;
/** Slide speed into an obstacle from which hitting it hurts. */
export const IMPACT_HURT_FROM = 6;
/** Health each unit of slide speed into an obstacle above IMPACT_HURT_FROM takes. */
export const IMPACT_HURT_SCALE = 5;
// Blocked speed below which a move counts as unblocked, in the slide's units.
const BLOCKED_FROM = 0.05;

/** How strongly ground with up-normal component `normalY` slides, 0..1. */
export function slideRamp(normalY: number, slip: number = 0): number {
  const angle = Math.acos(Math.min(1, Math.max(-1, normalY)));
  const start = SLIDE_START + (SLIDE_START_SLIPPERY - SLIDE_START) * slip;
  return smoothstep(angle, start, SLIDE_FULL);
}

/** Downhill acceleration on ground with up-normal component `normalY`. */
export function slideAccel(normalY: number, slip: number = 0): number {
  const sin = Math.sqrt(Math.max(0, 1 - normalY * normalY));
  return SLIDE_GRAVITY * sin * slideRamp(normalY, slip);
}

/** Share of the gap between walking and the keys closed over `seconds`: all of it on ground with grip. */
export function walkCatchUp(slip: number, seconds: number): number {
  if (slip <= 0) return 1;
  return 1 - Math.exp((-WALK_GRIP / slip) * seconds);
}

/**
 * Health a slide at `speed` takes over `seconds` on the ground: nothing below
 * SLIDE_HURT_FROM, rising to SLIDE_HURT_RATE a second at SLIDE_MAX_SPEED. A
 * long, fast slide down a steep face can kill. Slippery ground takes the harm
 * out of it, none at all on ice.
 */
export function slideDamage(
  speed: number,
  seconds: number,
  slip: number = 0
): number {
  return (
    SLIDE_HURT_RATE *
    smoothstep(speed, SLIDE_HURT_FROM, SLIDE_MAX_SPEED) *
    (1 - slip) *
    seconds
  );
}

/** Health hitting an obstacle at slide speed `speed` takes, on any ground. */
export function impactDamage(speed: number): number {
  return Math.max(0, speed - IMPACT_HURT_FROM) * IMPACT_HURT_SCALE;
}

/** Slide speed `speed` after `seconds` of friction at slide `ramp` 0..1. */
export function slideFriction(
  speed: number,
  ramp: number,
  seconds: number,
  slip: number = 0
): number {
  const friction = SLIDE_FRICTION * (1 - SLIP_FRICTION_CUT * slip);
  return speed * Math.exp(-friction * (1 - ramp) * seconds);
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
  /** Horizontal walking velocity, which lags the keys on slippery ground. */
  walkX = 0;
  walkZ = 0;
  /** Horizontal move from the last `step`: walking input plus the slide. */
  moveX = 0;
  moveZ = 0;
  /** Whether the last `step` held back walking input that pushed up a sliding slope. */
  climbing = false;
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
    this.walkX = 0;
    this.walkZ = 0;
    this.climbing = false;
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
   * On ground of `slip` 0..1 the walking lags the input, so the player skids.
   */
  step(
    moveX: number,
    moveZ: number,
    onGround: boolean,
    active: boolean,
    dt: number,
    seconds: number,
    slip: number = 0
  ): void {
    this.climbing = false;
    if (dt > 0) {
      const catchUp = active && onGround ? walkCatchUp(slip, seconds) : 1;
      this.walkX += (moveX / dt - this.walkX) * catchUp;
      this.walkZ += (moveZ / dt - this.walkZ) * catchUp;
      moveX = this.walkX * dt;
      moveZ = this.walkZ * dt;
    }
    if (!active) {
      this.velocityX = 0;
      this.velocityZ = 0;
    } else if (onGround) {
      const ramp = slideRamp(this.normalY, slip);
      const downLen = Math.hypot(this.normalX, this.normalZ);
      if (ramp > 0 && downLen > 1e-6) {
        const downX = this.normalX / downLen;
        const downZ = this.normalZ / downLen;
        const accel = slideAccel(this.normalY, slip) * dt;
        this.velocityX += downX * accel;
        this.velocityZ += downZ * accel;
        const cancel = uphillCancel(moveX, moveZ, downX, downZ, ramp);
        this.climbing = cancel > 0;
        moveX += downX * cancel;
        moveZ += downZ * cancel;
      }
      const speed = Math.hypot(this.velocityX, this.velocityZ);
      if (speed > 1e-6) {
        const eased = Math.min(
          slideFriction(speed, ramp, seconds, slip),
          SLIDE_MAX_SPEED
        );
        this.velocityX *= eased / speed;
        this.velocityZ *= eased / speed;
      }
    }
    this.moveX = moveX + this.velocityX * dt;
    this.moveZ = moveZ + this.velocityZ * dt;
  }

  /**
   * Takes out of the slide and the walk what an obstacle stopped. The move
   * asked for was (`wantX`, `wantZ`) and the controller allowed (`gotX`,
   * `gotZ`), over `dt`; the difference is the way the obstacle blocked, and
   * the velocity into it is lost, as in a dead stop. Returns the slide speed
   * lost into it, the speed of the impact.
   */
  collide(
    wantX: number,
    wantZ: number,
    gotX: number,
    gotZ: number,
    dt: number
  ): number {
    if (dt <= 0) return 0;
    const blockedX = wantX - gotX;
    const blockedZ = wantZ - gotZ;
    const blocked = Math.hypot(blockedX, blockedZ);
    if (blocked / dt < BLOCKED_FROM) return 0;
    const nx = blockedX / blocked;
    const nz = blockedZ / blocked;
    const slideInto = Math.max(0, this.velocityX * nx + this.velocityZ * nz);
    this.velocityX -= nx * slideInto;
    this.velocityZ -= nz * slideInto;
    const walkInto = Math.max(0, this.walkX * nx + this.walkZ * nz);
    this.walkX -= nx * walkInto;
    this.walkZ -= nz * walkInto;
    return slideInto;
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
