import { BehaviourState } from 'rewild-routing';
import { ShoalSettings } from '../CreaturePresets';
import { FlockPull } from '../Flocking';
import { IMovementMode, MovementSystem } from '../MovementSystem';

/** Outscores wander and loses to evade and seek. */
export const SHOAL_SCORE = 1.5;
/** Seconds the flock's pull acts over as it bends the heading. */
const RESPONSE = 1;
/** Seconds of travel ahead the goal is set, at the least AIM_MIN metres. */
const AIM_TIME = 2;
const AIM_MIN = 3;
/** Part of its walk speed a shoaling creature never slows below. */
const MIN_SPEED_SHARE = 0.5;
/** Part of the height range a member keeps above or below the group's level. */
const DEPTH_SPREAD = 0.15;
/** Part of the height range the flock's vertical pull moves a member's level. */
const DEPTH_PULL = 0.1;

/**
 * Travels with the rest of its group while their home is on the move,
 * steering by spacing, alignment and cohesion with its group mates and the
 * pull of the home, as a school does. Lets go when the home stops.
 */
export class Shoal implements IMovementMode {
  readonly name = 'shoal';
  private readonly pull: FlockPull;
  /** Its own level above or below the group's, picked on first use. */
  private depth = NaN;

  constructor(readonly settings: ShoalSettings) {
    this.pull = new FlockPull(settings);
  }

  score(system: MovementSystem): number {
    const group = system.group;
    return group && group.moving && group.members.length > 1 ? SHOAL_SCORE : 0;
  }

  enter(): void {}

  exit(): void {}

  update(_dt: number, system: MovementSystem): void {
    const group = system.group!;
    const { pull, settings } = this;
    const movement = system.settings;
    const sin = Math.sin(system.heading);
    const cos = Math.cos(system.heading);
    const vx = sin * system.speed;
    const vz = cos * system.speed;

    pull.begin();
    const { members } = group;
    for (let i = 0; i < members.length; i++) {
      const mate = members[i];
      if (mate === system) continue;
      pull.neighbour(
        mate.x - system.x,
        mate.y - system.y,
        mate.z - system.z,
        Math.sin(mate.heading) * mate.speed,
        mate.verticalSpeed,
        Math.cos(mate.heading) * mate.speed
      );
    }
    pull.gather(vx, system.verticalSpeed, vz);
    const hx = group.homeX - system.x;
    const hz = group.homeZ - system.z;
    pull.home(hx, 0, hz);

    const base = Math.max(system.speed, movement.walkSpeed * MIN_SPEED_SHARE);
    const shove = movement.acceleration * RESPONSE;
    const dx = sin * base + pull.x * shove;
    const dz = cos * base + pull.z * shove;
    const length = Math.hypot(dx, dz) || 1;
    const ahead = Math.max(AIM_MIN, system.speed * AIM_TIME);

    // Keeps up with the home, and hurries to catch it up from past homeRadius.
    const behind = Math.max(0, Math.hypot(hx, hz) - settings.homeRadius);
    const speed = Math.min(
      movement.runSpeed,
      Math.max(
        movement.walkSpeed * MIN_SPEED_SHARE,
        group.speed + (behind / settings.homeRadius) * movement.walkSpeed
      )
    );
    system.steerTo(
      system.x + (dx / length) * ahead,
      system.z + (dz / length) * ahead,
      speed
    );
    if (Number.isNaN(this.depth))
      this.depth = (system.random() * 2 - 1) * DEPTH_SPREAD;
    system.goalLevel = Math.max(
      0,
      Math.min(1, group.level + this.depth + pull.y * DEPTH_PULL)
    );
  }

  serialize(): BehaviourState {
    return {};
  }

  restore(): void {}
}
