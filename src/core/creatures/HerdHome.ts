import { Habitat } from './Habitat';
import { wrapAngle } from './MovementSystem';

/** Radians a drifting home's heading wanders each second, at most. */
export const DRIFT_TURN = 0.4;
/** Metres ahead a drifting home checks that it stays in the habitat. */
export const DRIFT_PROBE = 3;
/** Metres from its origin a drifting home may go when the rule leaves it out. */
export const DEFAULT_ROAM = 50;

/**
 * The home a group of creatures wanders round. A drifting home moves slowly
 * along a wandering heading, so the group moves together. It stays inside the
 * habitat and within `roam` of its origin.
 */
export class HerdHome {
  x: number;
  z: number;
  heading: number;

  constructor(
    readonly originX: number,
    readonly originZ: number,
    heading: number,
    /** m/s. 0 keeps the home at its origin. */
    readonly speed: number,
    readonly roam: number,
    private readonly habitat: Habitat,
    private readonly random: () => number = Math.random
  ) {
    this.x = originX;
    this.z = originZ;
    this.heading = heading;
  }

  update(dt: number): void {
    if (this.speed <= 0 || dt <= 0) return;

    const awayX = this.x - this.originX;
    const awayZ = this.z - this.originZ;
    if (Math.hypot(awayX, awayZ) >= this.roam)
      this.heading = Math.atan2(-awayX, -awayZ);
    else
      this.heading = wrapAngle(
        this.heading + (this.random() * 2 - 1) * DRIFT_TURN * dt
      );

    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    if (
      !this.habitat.canBe(
        this.x + sin * DRIFT_PROBE,
        this.z + cos * DRIFT_PROBE
      )
    ) {
      this.heading = wrapAngle(this.heading + Math.PI * (0.5 + this.random()));
      return;
    }

    const step = this.speed * dt;
    this.x += sin * step;
    this.z += cos * step;
  }
}
