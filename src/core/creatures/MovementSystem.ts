import { LocomotionSetName } from 'models';
import { Quaternion, Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { BehaviourState } from 'rewild-routing';
import { MovementSettings } from './CreaturePresets';
import { CreatureWorld, Habitat } from './Habitat';

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

const TWO_PI = Math.PI * 2;
const _forward = new Vector3();

/**
 * Moves one creature kinematically. Modes set a goal; the system turns toward
 * it at the turn rate, eases its speed, and keeps each step inside the habitat.
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

  /** Puts the creature at rest at a point, which becomes its home. */
  place(x: number, y: number, z: number, heading: number): void {
    this.x = this.homeX = x;
    this.y = y;
    this.z = this.homeZ = z;
    this.heading = heading;
    this.speed = 0;
    this.blocked = false;
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
    this.arbitrate();
    if (this.active) this.active.update(dt, this);
    else this.halt();
    this.step(dt);
  }

  applyTo(transform: Transform): void {
    transform.position.set(this.x, this.y, this.z);
    transform.rotation.set(0, this.heading, 0, transform.rotation.order);
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

  private step(dt: number): void {
    const { settings } = this;
    const dx = this.goalX - this.x;
    const dz = this.goalZ - this.z;
    const distance = Math.hypot(dx, dz);

    let target = 0;
    if (distance > ARRIVE_DISTANCE && this.goalSpeed > 0) {
      const desired = Math.atan2(dx, dz);
      this.heading = turnToward(this.heading, desired, settings.turnRate * dt);
      const facing = Math.cos(wrapAngle(desired - this.heading));
      target = Math.min(
        this.goalSpeed * Math.max(0, facing),
        Math.sqrt(2 * settings.acceleration * distance)
      );
    } else if (this.goalSpeed > 0) this.arrived = true;

    const change = settings.acceleration * dt;
    this.speed =
      this.speed < target
        ? Math.min(target, this.speed + change)
        : Math.max(target, this.speed - change);

    if (this.speed > 0) this.move(this.speed * dt, dt);

    const ground = this.world.sampleHeight(this.x, this.z);
    if (ground !== null) this.y = ground;
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
