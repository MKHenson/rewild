import { LocomotionSetName } from 'models';
import { Quaternion, Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { BehaviourState } from 'rewild-routing';
import { MovementSettings } from './CreaturePresets';
import { CreatureWorld, Habitat, HeightRange } from './Habitat';

/** The parts of the animation controller movement modes use. */
export interface ICreatureAnimator {
  play(meaning: string, loop?: boolean): boolean;
  stop(meaning: string): void;
  setLocomotion(name: LocomotionSetName): void;
}

/** One way of moving. The system gives control to the mode that scores highest. */
export interface IMovementMode {
  readonly name: string;
  /** How much the mode wants control this frame. 0 never takes it. */
  score(system: MovementSystem): number;
  enter(system: MovementSystem): void;
  exit(system: MovementSystem): void;
  /** Sets the goal with `steerTo` or `halt`. */
  update(dt: number, system: MovementSystem): void;
  serialize(): BehaviourState;
  restore(state: BehaviourState): void;
}

/** Metres from the goal at which the creature counts as there. */
export const ARRIVE_DISTANCE = 0.3;
/** Turns tried, in radians, when the step ahead leaves the habitat. */
export const DETOUR_ANGLES = [Math.PI / 4, Math.PI / 2];
/** The stable id movement modes save in place of the player. */
export const PLAYER_ID = 'player';
/** m/s². */
export const GRAVITY = 9.8;
/** Metres above the ground a walking creature still counts as on it. */
export const SNAP_DISTANCE = 0.5;
/** Points checked along the path for rising ground. */
const LOOK_AHEAD_SAMPLES = 2;
/** m/s of height change for each metre from the target height. */
const HEIGHT_RESPONSE = 1;
/** Seconds a roll takes to settle. */
const ROLL_SMOOTHING = 0.4;

const TWO_PI = Math.PI * 2;
const _forward = new Vector3();
const _range: HeightRange = { min: 0, max: 0 };

/**
 * Moves one creature kinematically. Modes set a goal; the system turns toward
 * it at the turn rate, eases its speed, and keeps each step inside the habitat.
 * A creature in the wrong medium falls to the ground and stays still.
 */
export class MovementSystem {
  x = 0;
  y = 0;
  z = 0;
  /** Radians about Y. 0 faces +Z. */
  heading = 0;
  /** m/s along the heading. */
  speed = 0;
  homeX = 0;
  homeZ = 0;
  /** The last step found no direction inside the habitat. */
  blocked = false;
  /** The creature is at its goal. */
  arrived = true;
  /** m/s up. */
  verticalSpeed = 0;
  /** Radians about the creature's forward axis. */
  roll = 0;
  /** Where in its height range it aims, 0 lowest to 1 highest. */
  goalLevel = 0.5;
  /** It is in the wrong medium. */
  stranded = false;

  readonly settings: MovementSettings;
  readonly habitat: Habitat;
  readonly world: CreatureWorld;
  readonly animator: ICreatureAnimator | null;
  readonly random: () => number;
  readonly modes: IMovementMode[];

  private active: IMovementMode | null = null;
  private goalX = 0;
  private goalZ = 0;
  private goalSpeed = 0;
  private detourSign = 1;

  constructor(
    settings: MovementSettings,
    habitat: Habitat,
    world: CreatureWorld,
    modes: IMovementMode[],
    animator: ICreatureAnimator | null = null,
    random: () => number = Math.random
  ) {
    this.settings = settings;
    this.habitat = habitat;
    this.world = world;
    this.modes = modes;
    this.animator = animator;
    this.random = random;
  }

  get activeMode(): string | null {
    return this.active?.name ?? null;
  }

  /** m/s a flying creature is climbing. */
  get climb(): number {
    return this.habitat.flies ? Math.max(0, this.verticalSpeed) : 0;
  }

  /** Puts the creature at rest at a point, which becomes its home. */
  place(x: number, y: number, z: number, heading: number): void {
    this.x = this.homeX = x;
    this.y = y;
    this.z = this.homeZ = z;
    this.heading = heading;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.roll = 0;
    this.blocked = false;
    this.stranded = false;
    this.active = null;
    this.halt();
  }

  /** Places the creature from a transform's position and facing. */
  placeAt(position: Vector3, rotation: Quaternion): void {
    _forward.set(0, 0, 1).applyQuaternion(rotation);
    this.place(
      position.x,
      position.y,
      position.z,
      Math.atan2(_forward.x, _forward.z)
    );
  }

  steerTo(x: number, z: number, speed: number): void {
    if (x !== this.goalX || z !== this.goalZ) {
      this.arrived = false;
      this.blocked = false;
    }
    this.goalX = x;
    this.goalZ = z;
    this.goalSpeed = speed;
  }

  halt(): void {
    this.goalX = this.x;
    this.goalZ = this.z;
    this.goalSpeed = 0;
    this.arrived = true;
  }

  update(dt: number): void {
    this.stranded = this.habitat.stranded?.(this.x, this.z) ?? false;
    if (this.stranded) this.release();
    else {
      this.arbitrate();
      if (this.active) this.active.update(dt, this);
      else this.halt();
    }
    this.step(dt);
  }

  applyTo(transform: Transform): void {
    transform.position.set(this.x, this.y, this.z);
    transform.rotation.set(
      0,
      this.heading,
      this.roll,
      transform.rotation.order
    );
  }

  serialize(): BehaviourState {
    const modes: BehaviourState = {};
    for (let i = 0; i < this.modes.length; i++)
      modes[this.modes[i].name] = this.modes[i].serialize();
    return {
      active: this.activeMode,
      x: this.x,
      y: this.y,
      z: this.z,
      heading: this.heading,
      speed: this.speed,
      modes,
    };
  }

  restore(state: BehaviourState): void {
    if (typeof state.x === 'number') this.x = state.x;
    if (typeof state.y === 'number') this.y = state.y;
    if (typeof state.z === 'number') this.z = state.z;
    if (typeof state.heading === 'number') this.heading = state.heading;
    if (typeof state.speed === 'number') this.speed = state.speed;

    const modes = state.modes;
    if (modes && typeof modes === 'object' && !Array.isArray(modes))
      for (let i = 0; i < this.modes.length; i++) {
        const saved = modes[this.modes[i].name];
        if (saved && typeof saved === 'object' && !Array.isArray(saved))
          this.modes[i].restore(saved);
      }

    if (typeof state.active === 'string')
      this.active = this.modes.find((m) => m.name === state.active) ?? null;
    this.halt();
  }

  private arbitrate(): void {
    let best: IMovementMode | null = null;
    let bestScore = 0;
    for (let i = 0; i < this.modes.length; i++) {
      const score = this.modes[i].score(this);
      if (score > bestScore) {
        best = this.modes[i];
        bestScore = score;
      }
    }
    if (best === this.active) return;
    this.active?.exit(this);
    this.active = best;
    best?.enter(this);
  }

  private release(): void {
    this.active?.exit(this);
    this.active = null;
    this.speed = 0;
    this.halt();
  }

  private step(dt: number): void {
    const { settings } = this;
    const before = this.heading;
    const cruise = this.stranded ? 0 : settings.cruiseSpeed ?? 0;
    const dx = this.goalX - this.x;
    const dz = this.goalZ - this.z;
    const distance = Math.hypot(dx, dz);
    // A creature that cannot slow down can only reach what is outside its turn.
    const arrive = Math.max(ARRIVE_DISTANCE, cruise / settings.turnRate);

    let target = 0;
    if (distance > arrive && this.goalSpeed > 0) {
      const desired = Math.atan2(dx, dz);
      this.heading = turnToward(this.heading, desired, settings.turnRate * dt);
      const facing = Math.cos(wrapAngle(desired - this.heading));
      target = Math.min(
        this.goalSpeed * Math.max(0, facing),
        Math.sqrt(2 * settings.acceleration * distance)
      );
    } else if (this.goalSpeed > 0) this.arrived = true;
    target = Math.max(target, cruise);

    const change = settings.acceleration * dt;
    this.speed =
      this.speed < target
        ? Math.min(target, this.speed + change)
        : Math.max(target, this.speed - change);

    if (this.speed > 0) this.move(this.speed * dt, dt);

    this.updateRoll(before, dt);
    this.updateHeight(dt);
  }

  private updateRoll(before: number, dt: number): void {
    const { bank, turnRate } = this.settings;
    if (!bank) return;
    const turn = wrapAngle(this.heading - before) / (turnRate * dt);
    const target = -bank * Math.max(-1, Math.min(1, turn));
    this.roll += (target - this.roll) * (1 - Math.exp(-dt / ROLL_SMOOTHING));
  }

  private updateHeight(dt: number): void {
    const { habitat, settings } = this;
    const ground = this.world.sampleHeight(this.x, this.z);
    if (ground === null) {
      this.verticalSpeed = 0;
      return;
    }

    let min = ground;
    let max = ground;
    if (!this.stranded && habitat.heightRange?.(this.x, this.z, _range)) {
      min = _range.min;
      max = _range.max;
      const reach = this.speed * (habitat.lookAhead ?? 0);
      for (let i = 1; reach > 0 && i <= LOOK_AHEAD_SAMPLES; i++) {
        const ahead = (reach * i) / LOOK_AHEAD_SAMPLES;
        const x = this.x + Math.sin(this.heading) * ahead;
        const z = this.z + Math.cos(this.heading) * ahead;
        if (!habitat.heightRange(x, z, _range) || _range.min <= min) continue;
        min = _range.min;
        max = Math.max(max, _range.max);
      }
    }

    const climb = settings.climbSpeed ?? 0;
    const snap = climb > 0 ? 0 : SNAP_DISTANCE;
    if (!habitat.flies && this.y > max + snap) {
      this.verticalSpeed = Math.min(this.verticalSpeed, 0) - GRAVITY * dt;
      this.y = Math.max(max, this.y + this.verticalSpeed * dt);
      return;
    }

    const target = min + this.goalLevel * (max - min);
    if (climb <= 0) {
      this.y = target;
      this.verticalSpeed = 0;
      return;
    }

    const desired = Math.max(
      -climb,
      Math.min(climb, (target - this.y) * HEIGHT_RESPONSE)
    );
    const change = settings.acceleration * dt;
    this.verticalSpeed =
      this.verticalSpeed < desired
        ? Math.min(desired, this.verticalSpeed + change)
        : Math.max(desired, this.verticalSpeed - change);
    this.y += this.verticalSpeed * dt;

    if (this.y < ground) {
      this.y = ground;
      this.verticalSpeed = Math.max(this.verticalSpeed, 0);
    }
    if (!habitat.flies && this.y > max) {
      this.y = max;
      this.verticalSpeed = Math.min(this.verticalSpeed, 0);
    }
  }

  /** Steps along the heading, or the nearest detour inside the habitat. */
  private move(distance: number, dt: number): void {
    this.blocked = false;

    // A creature outside its habitat walks freely, so it can find its way back.
    if (!this.habitat.canBe(this.x, this.z)) {
      this.x += Math.sin(this.heading) * distance;
      this.z += Math.cos(this.heading) * distance;
      return;
    }
    if (this.tryStep(this.heading, distance)) return;

    for (let i = 0; i < DETOUR_ANGLES.length; i++)
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? this.detourSign : -this.detourSign;
        const direction = this.heading + DETOUR_ANGLES[i] * sign;
        if (!this.tryStep(direction, distance)) continue;
        this.detourSign = sign;
        this.heading = turnToward(
          this.heading,
          direction,
          this.settings.turnRate * dt
        );
        return;
      }

    this.speed = 0;
    this.blocked = true;
  }

  private tryStep(direction: number, distance: number): boolean {
    const x = this.x + Math.sin(direction) * distance;
    const z = this.z + Math.cos(direction) * distance;
    if (!this.habitat.canBe(x, z)) return false;
    this.x = x;
    this.z = z;
    return true;
  }
}

/** An angle in -π to π. */
export function wrapAngle(angle: number): number {
  angle = (angle + Math.PI) % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle - Math.PI;
}

function turnToward(from: number, to: number, maxStep: number): number {
  const delta = wrapAngle(to - from);
  if (Math.abs(delta) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(delta) * maxStep);
}
