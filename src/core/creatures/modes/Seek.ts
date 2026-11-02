import { Vector3 } from 'rewild-common';
import { BehaviourState } from 'rewild-routing';
import { DEFAULT_SET } from '../../animation/AnimationController';
import { SeekSettings } from '../CreaturePresets';
import { IMovementMode, MovementSystem, PLAYER_ID } from '../MovementSystem';

/** Metres ahead an evading creature aims, away from the player. */
export const EVADE_LOOKAHEAD = 5;

/**
 * Runs toward the player inside a radius, or away from them when `flee` is
 * set (evade). Lets go past the release radius.
 */
export class Seek implements IMovementMode {
  readonly name: string;
  engaged = false;

  private readonly settings: SeekSettings;
  private readonly flee: boolean;
  private readonly player = new Vector3();

  constructor(name: string, settings: SeekSettings, flee: boolean) {
    this.name = name;
    this.settings = settings;
    this.flee = flee;
  }

  score(system: MovementSystem): number {
    if (!system.world.playerPosition(this.player)) {
      this.engaged = false;
      return 0;
    }
    const distance = Math.hypot(
      this.player.x - system.x,
      this.player.z - system.z
    );
    const { radius, release } = this.settings;
    this.engaged = distance < (this.engaged ? release : radius);
    return this.engaged ? 2 : 0;
  }

  enter(system: MovementSystem): void {
    if (this.settings.locomotion)
      system.animator?.setLocomotion(this.settings.locomotion);
  }

  exit(system: MovementSystem): void {
    if (this.settings.locomotion) system.animator?.setLocomotion(DEFAULT_SET);
  }

  update(_dt: number, system: MovementSystem): void {
    const { player } = this;
    const speed = system.settings.runSpeed;
    if (!this.flee) {
      system.steerTo(player.x, player.z, speed);
      return;
    }

    const dx = system.x - player.x;
    const dz = system.z - player.z;
    const distance = Math.hypot(dx, dz);
    const scale = distance > 1e-6 ? EVADE_LOOKAHEAD / distance : 0;
    const x =
      scale > 0
        ? system.x + dx * scale
        : system.x + Math.sin(system.heading) * EVADE_LOOKAHEAD;
    const z =
      scale > 0
        ? system.z + dz * scale
        : system.z + Math.cos(system.heading) * EVADE_LOOKAHEAD;
    system.steerTo(x, z, speed);
  }

  serialize(): BehaviourState {
    return { target: PLAYER_ID, engaged: this.engaged };
  }

  restore(state: BehaviourState): void {
    if (typeof state.engaged === 'boolean') this.engaged = state.engaged;
  }
}
