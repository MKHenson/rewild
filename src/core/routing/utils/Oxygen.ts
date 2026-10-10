/** Oxygen a full breath holds. */
export const OXYGEN_FULL = 100;
/** Oxygen a second under water uses: a full breath lasts thirty seconds. */
export const OXYGEN_USE = OXYGEN_FULL / 30;
/** Oxygen a second above water brings back: an empty breath refills in ten seconds. */
export const OXYGEN_RECOVER = OXYGEN_FULL / 10;
/** Health a second of drowning takes: ten seconds from full health to death. */
export const DROWN_DAMAGE = 10;

/**
 * The player's breath under water. It runs down while the head is under and
 * refills slowly above water. Run out and the player drowns.
 */
export class Oxygen {
  value = OXYGEN_FULL;

  reset(): void {
    this.value = OXYGEN_FULL;
  }

  /** Whether the player is out of air and drowning. */
  get drowning(): boolean {
    return this.value <= 0;
  }

  /**
   * @param under Whether the head is under water.
   * @returns The health drowning takes this frame.
   */
  update(under: boolean, seconds: number): number {
    if (!under) {
      this.value = Math.min(OXYGEN_FULL, this.value + OXYGEN_RECOVER * seconds);
      return 0;
    }
    const left = this.value - OXYGEN_USE * seconds;
    this.value = Math.max(0, left);
    if (left >= 0) return 0;
    return DROWN_DAMAGE * Math.min(seconds, -left / OXYGEN_USE);
  }
}
