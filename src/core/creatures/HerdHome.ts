import { Habitat } from './Habitat';
import { wrapAngle } from './MovementSystem';

/** Radians a drifting home's heading wanders each second, at most. */
export const DRIFT_TURN = 0.4;
/** Metres ahead a drifting home checks that it stays in the habitat. */
export const DRIFT_PROBE = 3;
/** Metres from its origin a drifting home may go when the rule leaves it out. */
export const DEFAULT_ROAM = 50;

/** Seconds a home rests, then seconds it travels, each picked in its range. */
export interface HomeCycle {
  settle: [number, number];
  travel: [number, number];
}

/**
 * The home a group of creatures wanders round. A drifting home moves slowly
 * along a wandering heading, so the group moves together. It stays inside the
 * habitat and within `roam` of its origin. With a `cycle` it rests and
 * travels by turns, resting first unless `joinCycle` puts it elsewhere.
 */
export class HerdHome {
  x: number;
  z: number;
  heading: number;
  cycle: HomeCycle | null = null;
  /** Resting, in its cycle. */
  resting = false;
  /** Seconds left of the current rest or travel. */
  timer = 0;

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

  /**
   * Puts the home at a random point of its cycle: resting or travelling in
   * proportion to how long each lasts, partway through. For a group the player
   * comes across, which has been going for some time already.
   */
  joinCycle(): void {
    const { cycle } = this;
    if (!cycle) return;
    const settle = (cycle.settle[0] + cycle.settle[1]) / 2;
    const travel = (cycle.travel[0] + cycle.travel[1]) / 2;
    this.resting = this.random() * (settle + travel) < settle;
    const [min, max] = this.resting ? cycle.settle : cycle.travel;
    this.timer = (min + this.random() * (max - min)) * this.random();
  }

  /** Whether it is moving now. */
  get moving(): boolean {
    return this.speed > 0 && !this.resting;
  }

  update(dt: number): void {
    if (this.speed <= 0 || dt <= 0) return;
    const { cycle } = this;
    if (cycle) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.resting = !this.resting;
        const [min, max] = this.resting ? cycle.settle : cycle.travel;
        this.timer = min + this.random() * (max - min);
      }
      if (this.resting) return;
    }

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
