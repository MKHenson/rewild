import { smoothstep } from 'rewild-common';
import {
  OPEN_CUTOFF_HZ,
  type AudioEngine,
  type AudioScope,
  type Bed,
  type PlayOptions,
} from 'rewild-audio';

/** The world bus's cutoff and gain with the camera under water. */
export const UNDER_WATER_CUTOFF = 600;
export const UNDER_WATER_LEVEL = 0.5;

/** Seconds by e the world takes to go under and to come back. */
const MUFFLE_TIME = 0.035;

/** The world bus's cutoff and gain once the player has died. */
export const DEAD_CUTOFF = 500;
export const DEAD_LEVEL = 0.2;
/** Seconds by e the world takes to go distant on death, about 2 s in all. */
const DEATH_TIME = 0.67;
/** Seconds by e the world takes to come back for a new game, about 1 s in all. */
const LIFT_TIME = 0.33;

/** The world bus's cutoff and gain when the player is fully dazed. */
export const DAZED_CUTOFF = 3000;
export const DAZED_LEVEL = 0.75;
/** Seconds by e the world takes to follow the daze. */
const DAZE_TIME = 0.5;
/** Change in daze that moves the world. */
const DAZE_STEP = 0.02;

/** The world bus's cutoff above water at `daze` 0..1. */
export function dazedCutoff(daze: number): number {
  return OPEN_CUTOFF_HZ * Math.pow(DAZED_CUTOFF / OPEN_CUTOFF_HZ, daze);
}

/** The world bus's gain above water at `daze` 0..1. */
export function dazedLevel(daze: number): number {
  return 1 - (1 - DAZED_LEVEL) * daze;
}

// Plunge speeds are in Player.verticalVelocity's units, down: a jump on flat
// ground lands at about 10.5, and a fall hurts from 15.

/** Speed below which entering the water makes no plunge, as when wading in. */
export const PLUNGE_FROM = 2;
/** Speed from which a plunge is a big one: a fall from well above a jump. */
export const PLUNGE_BIG_AT = 14;
/** Speed at which a plunge is at full gain. */
const PLUNGE_FULL_AT = 20;
/** A plunge's gain at `PLUNGE_FROM`. */
const PLUNGE_SOFTEST = 0.4;
/** Metres of water, bed to surface, a big plunge needs; shallower ones are small. */
export const PLUNGE_BIG_DEPTH = 1.5;
/** A plunge's gain into the shallowest water, against one into `PLUNGE_BIG_DEPTH`. */
const PLUNGE_SHALLOW = 0.4;

/** Seconds the camera must stay under before coming up splashes. */
export const SURFACE_AFTER = 0.5;

export type PlungeSoundName = 'plunge-small' | 'plunge-big';

/** The plunge for hitting water `depth` metres deep at `speed` downward, or null for none. */
export function plungeSound(
  speed: number,
  depth: number
): PlungeSoundName | null {
  if (speed < PLUNGE_FROM) return null;
  return speed >= PLUNGE_BIG_AT && depth >= PLUNGE_BIG_DEPTH
    ? 'plunge-big'
    : 'plunge-small';
}

/** A plunge's gain: soft for a step in or a landing in the shallows, full for a fall from a cliff into deep water. */
export function plungeGain(speed: number, depth: number): number {
  const fall =
    PLUNGE_SOFTEST +
    (1 - PLUNGE_SOFTEST) * smoothstep(speed, PLUNGE_FROM, PLUNGE_FULL_AT);
  const deep =
    PLUNGE_SHALLOW +
    (1 - PLUNGE_SHALLOW) * smoothstep(depth, 0, PLUNGE_BIG_DEPTH);
  return fall * deep;
}

/**
 * The player in water: a plunge as the feet hit the water, sized by the fall;
 * the world muffled and an under-water bed while the camera is under; and a
 * splash as it comes back up. The splashes are in the water around the head,
 * so they play on the world and go dull when it dips under again; the bed is
 * the sound under water itself, so it skips the muffle.
 */
export class UnderWaterSound {
  private readonly _bed: Bed;
  private readonly _options: PlayOptions = { bus: 'effects', gain: 1 };
  private _wet = false;
  private _under = false;
  private _underFor = 0;
  private _daze = 0;
  private _dead = false;

  constructor(
    private readonly _engine: AudioEngine,
    private readonly _scope: AudioScope
  ) {
    this._bed = _scope.createBed({
      sounds: ['under-water'],
      bus: 'player',
      attack: 0.15,
      release: 0.4,
    });
    this._engine.muffleWorld(OPEN_CUTOFF_HZ, 1, LIFT_TIME);
  }

  /**
   * Pulls the world away a little above water, as when badly hurt.
   * @param daze 0..1.
   */
  setDaze(daze: number): void {
    if (Math.abs(daze - this._daze) < DAZE_STEP && (daze > 0 || !this._daze))
      return;
    this._daze = daze;
    if (!this._under) this._open(DAZE_TIME);
  }

  get underWater(): boolean {
    return this._under;
  }

  /**
   * @param immersion        Metres of water over the feet.
   * @param depth            Metres of water from the bed to the surface.
   * @param cameraUnderWater Whether the eye is below the surface.
   * @param verticalVelocity Player.verticalVelocity, before the water slows it.
   */
  update(
    immersion: number,
    depth: number,
    cameraUnderWater: boolean,
    verticalVelocity: number,
    seconds: number
  ): void {
    const wet = immersion > 0;
    if (wet && !this._wet) {
      const speed = -verticalVelocity;
      const sound = plungeSound(speed, depth);
      if (sound) {
        this._options.gain = plungeGain(speed, depth);
        this._scope.play(sound, this._options);
      }
    }
    this._wet = wet;

    if (cameraUnderWater !== this._under) {
      if (cameraUnderWater)
        this._engine.muffleWorld(
          UNDER_WATER_CUTOFF,
          UNDER_WATER_LEVEL,
          MUFFLE_TIME
        );
      else {
        this._open(MUFFLE_TIME);
        if (this._underFor >= SURFACE_AFTER) {
          this._options.gain = 1;
          this._scope.play('surface', this._options);
        }
      }
      this._under = cameraUnderWater;
      this._underFor = 0;
    }
    if (this._under) this._underFor += seconds;
    this._bed.set(this._under ? 1 : 0);
  }

  /** The player died: the world goes distant and dull, and the bed fades. */
  die(): void {
    this._dead = true;
    this._engine.muffleWorld(DEAD_CUTOFF, DEAD_LEVEL, DEATH_TIME);
    this._bed.set(0);
  }

  /** Lifts the muffle, slowly after a death, and stops the bed. */
  dispose(): void {
    this._engine.muffleWorld(
      OPEN_CUTOFF_HZ,
      1,
      this._dead ? LIFT_TIME : MUFFLE_TIME
    );
    this._bed.dispose(0.3);
  }

  /** The world above water, dulled by the daze. */
  private _open(timeConstant: number): void {
    this._engine.muffleWorld(
      dazedCutoff(this._daze),
      dazedLevel(this._daze),
      timeConstant
    );
  }
}
