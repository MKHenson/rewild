import { Vector3 } from 'rewild-common';
import { BehaviourState } from 'rewild-routing';
import { DEFAULT_SET } from '../../animation/AnimationController';
import { SeekSettings } from '../CreaturePresets';
import { IMovementMode, MovementSystem, PLAYER_ID } from '../MovementSystem';

/** Metres ahead an evading creature aims, away from the player. */
export const EVADE_LOOKAHEAD = 5;
/** Seconds the player's measured speed takes to settle, so one jolt does not startle. */
const SPEED_SMOOTHING = 0.2;

/**
 * Runs toward the player inside a radius, or away from them when `flee` is
 * set (evade). A swimmer that flees also heads for the depth furthest from
 * them. With `startle`, it only takes control while the player moves. Lets go
 * past the release radius.
 */
export class Seek implements IMovementMode {
  readonly name: string;
  engaged = false;

  private readonly settings: SeekSettings;
  private readonly flee: boolean;
  private readonly player = new Vector3();
  private readonly last = new Vector3();
  /** m/s the player has been moving at, smoothed. */
  private playerSpeed = 0;
  private seen = false;

  constructor(name: string, settings: SeekSettings, flee: boolean) {
    this.name = name;
    this.settings = settings;
    this.flee = flee;
  }

  score(system: MovementSystem): number {
    if (!system.world.playerPosition(this.player)) {
      this.engaged = false;
      this.seen = false;
      return 0;
    }
    const { player } = this;
    this.trackPlayer(system.dt);
    const distance = system.distanceTo(player.x, player.y, player.z);
    const { radius, release, startle } = this.settings;
    if (this.engaged) this.engaged = distance < release;
    else
      this.engaged =
        distance < radius &&
        (startle === undefined || this.playerSpeed > startle);
    return this.engaged ? 2 : 0;
  }

  /** Eases `playerSpeed` toward how fast the player moved since last time. */
  private trackPlayer(dt: number): void {
    const { player, last } = this;
    if (this.seen && dt > 0) {
      const moved =
        Math.hypot(player.x - last.x, player.y - last.y, player.z - last.z) /
        dt;
      this.playerSpeed +=
        (moved - this.playerSpeed) * (1 - Math.exp(-dt / SPEED_SMOOTHING));
    }
    last.copy(player);
    this.seen = true;
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

    if (system.habitat.swims) system.goalLevel = player.y > system.y ? 0 : 1;
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
