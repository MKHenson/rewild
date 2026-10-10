import type { AudioScope, PlayOptions } from 'rewild-audio';

/** Seconds between strokes at the surface, and sprinting. */
export const STROKE_EVERY = 0.9;
export const STROKE_EVERY_FAST = 0.65;
/** Seconds between strokes under water, and sprinting: slower, longer pulls. */
export const DIVE_STROKE_EVERY = 1.3;
export const DIVE_STROKE_EVERY_FAST = 1;
/** Seconds from starting to swim to the first stroke. */
export const FIRST_STROKE = 0.15;
/** Chance that a stroke under water lets out bubbles. */
export const BUBBLES_CHANCE = 0.4;

/** Seconds between strokes. */
export function strokeInterval(under: boolean, fast: boolean): number {
  if (under) return fast ? DIVE_STROKE_EVERY_FAST : DIVE_STROKE_EVERY;
  return fast ? STROKE_EVERY_FAST : STROKE_EVERY;
}

/**
 * The player swimming: a stroke now and then while moving, and under water
 * slower, muffled strokes that sometimes let out bubbles. Standing up out of
 * a swim makes the body emerge from the water. On the player bus, in 2D; the
 * bubbles are in the water around the head, so they play on the world and go
 * dull with its under-water muffle.
 */
export class SwimSound {
  random: () => number = Math.random;

  private readonly _options: PlayOptions = { bus: 'player', gain: 1 };
  private readonly _bubbles: PlayOptions = { bus: 'effects', gain: 1 };
  private _next = FIRST_STROKE;
  private _wasSwimming = false;

  constructor(private readonly _sink: Pick<AudioScope, 'play'>) {}

  /**
   * @param swimming Whether the player swims.
   * @param under    Whether the eye is under water.
   * @param moving   Whether the swimmer pushes in any direction.
   * @param fast     Whether the swimmer sprints.
   */
  update(
    swimming: boolean,
    under: boolean,
    moving: boolean,
    fast: boolean,
    seconds: number
  ): void {
    if (this._wasSwimming && !swimming)
      this._sink.play('swim-emerge', this._options);
    this._wasSwimming = swimming;
    if (!swimming || !moving) {
      this._next = FIRST_STROKE;
      return;
    }
    this._next -= seconds;
    if (this._next > 0) return;
    this._next += strokeInterval(under, fast);
    if (this._next < 0) this._next = 0;
    this._sink.play(under ? 'swim-stroke-under' : 'swim-stroke', this._options);
    if (under && this.random() < BUBBLES_CHANCE)
      this._sink.play('swim-bubbles', this._bubbles);
  }
}
