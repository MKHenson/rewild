import type { AudioScope, Bed } from 'rewild-audio';

/** Seconds by e the body takes to drip dry out of the water. */
export const DRY_TIME = 4;
/** Soak below which the body has stopped dripping. */
const DRY = 0.01;

/** How soaked the body is, 0..1, after `seconds` out of the water. */
export function drySoak(soak: number, seconds: number): number {
  const next = soak * Math.exp(-seconds / DRY_TIME);
  return next < DRY ? 0 : next;
}

/**
 * Water dripping off the player after a swim. Swimming soaks the body; out of
 * the water a drip bed plays at the soak, which fades as the body dries.
 * Wading does not soak it. On the player bus, in 2D.
 */
export class DripSound {
  private readonly _bed: Bed;
  private _soak = 0;

  constructor(scope: Pick<AudioScope, 'createBed'>) {
    this._bed = scope.createBed({
      sounds: ['body-drips'],
      bus: 'player',
      attack: 0.3,
      release: 1.5,
    });
  }

  /** 0..1: how soaked the body is now. */
  get soak(): number {
    return this._soak;
  }

  /**
   * @param swimming  Whether the player swims.
   * @param immersion Metres of water over the feet.
   */
  update(swimming: boolean, immersion: number, seconds: number): void {
    if (swimming) this._soak = 1;
    if (immersion > 0) {
      this._bed.set(0);
      return;
    }
    this._soak = drySoak(this._soak, seconds);
    this._bed.set(this._soak);
  }

  dispose(): void {
    this._bed.dispose(0.3);
  }
}
