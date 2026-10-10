import { smoothstep } from 'rewild-common';

/** Stamina a full bar holds. */
export const STAMINA_FULL = 100;
/** Stamina a second of sprinting spends: a full bar lasts eight seconds. */
export const SPRINT_COST = STAMINA_FULL / 8;
/** Stamina a jump spends. */
export const JUMP_COST = 15;
/** Seconds after spending before stamina comes back, and how fast it does. */
export const RECOVER_AFTER = 1;
export const RECOVER_RATE = 20;
/** Seconds an empty bar waits before it refills, and how fast it then does. */
export const EXHAUSTED_WAIT = 2.5;
export const EXHAUSTED_RATE = 60;
/** Stamina from which a jump has its full force. */
export const JUMP_FULL_FROM = 30;
/** Share of a full jump's force left with no stamina. */
export const JUMP_WEAKEST = 0.45;

/** The share of a full jump's force a jump has with `stamina` left. */
export function jumpShare(stamina: number): number {
  return (
    JUMP_WEAKEST + (1 - JUMP_WEAKEST) * smoothstep(stamina, 0, JUMP_FULL_FROM)
  );
}

/**
 * The player's stamina. Sprinting and jumping spend it; it comes back soon
 * after. Run it empty and the player is exhausted: it waits a few seconds,
 * then refills quickly, and the player cannot sprint until it is full.
 */
export class Stamina {
  value = STAMINA_FULL;
  /** Whether the bar ran empty and has not refilled yet. */
  exhausted = false;

  private _rest = 0;

  reset(): void {
    this.value = STAMINA_FULL;
    this.exhausted = false;
    this._rest = 0;
  }

  /** Sets the stamina as if spent down to `value`: empty exhausts the player. */
  set(value: number): void {
    this.reset();
    this._spend(STAMINA_FULL - Math.min(STAMINA_FULL, Math.max(0, value)));
  }

  /** Whether the player can sprint now. */
  get canSprint(): boolean {
    return !this.exhausted;
  }

  /**
   * Spends stamina on a jump.
   * @returns The share of a full jump's force the jump has.
   */
  jump(): number {
    const share = jumpShare(this.value);
    this._spend(JUMP_COST);
    return share;
  }

  /** @param sprinting Whether the player sprints this frame. */
  update(sprinting: boolean, seconds: number): void {
    if (sprinting && !this.exhausted) {
      this._spend(SPRINT_COST * seconds);
      return;
    }
    this._rest -= seconds;
    if (this._rest > 0) return;
    const rate = this.exhausted ? EXHAUSTED_RATE : RECOVER_RATE;
    this.value = Math.min(STAMINA_FULL, this.value + rate * seconds);
    if (this.value >= STAMINA_FULL) this.exhausted = false;
  }

  private _spend(amount: number): void {
    if (this.exhausted) return;
    this.value = Math.max(0, this.value - amount);
    if (this.value > 0) {
      this._rest = RECOVER_AFTER;
      return;
    }
    this.exhausted = true;
    this._rest = EXHAUSTED_WAIT;
  }
}
