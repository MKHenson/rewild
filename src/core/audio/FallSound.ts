import type { AudioScope, Bed } from 'rewild-audio';

/** The rush's low-pass cutoff as a fall starts to rush and at full speed. */
const RUSH_CUTOFF_FROM = 600;
const RUSH_CUTOFF_FULL = 16000;
/** The flapping's playback rate as a fall starts to rush and at full speed. */
const FLAP_RATE_FROM = 0.8;
const FLAP_RATE_FULL = 1.25;
/** Seconds the beds take to cut out on landing. */
const LAND_CUT = 0.1;

/** The rush's low-pass cutoff in Hz at `freefall` 0..1: dull, then roaring. */
export function rushCutoff(freefall: number): number {
  const f = Math.min(1, Math.max(0, freefall));
  return RUSH_CUTOFF_FROM * Math.pow(RUSH_CUTOFF_FULL / RUSH_CUTOFF_FROM, f);
}

/** The flapping's playback rate at `freefall` 0..1: faster the faster the fall. */
export function flapRate(freefall: number): number {
  const f = Math.min(1, Math.max(0, freefall));
  return FLAP_RATE_FROM + (FLAP_RATE_FULL - FLAP_RATE_FROM) * f;
}

/**
 * Falling fast: air roaring past and clothes flapping, rising with
 * freefallShare and cut on landing. On the player bus, in 2D.
 */
export class FallSound {
  private readonly _rush: Bed;
  private readonly _flap: Bed;

  constructor(scope: Pick<AudioScope, 'createBed'>) {
    this._rush = scope.createBed({
      sounds: ['fall-rush'],
      bus: 'player',
      filter: 'lowpass',
      attack: 0.5,
      release: LAND_CUT,
    });
    this._flap = scope.createBed({
      sounds: ['fall-flap'],
      bus: 'player',
      attack: 0.5,
      release: LAND_CUT,
    });
  }

  /** @param freefall 0..1: freefallShare, 0 on the ground or in the water. */
  update(freefall: number): void {
    this._rush.set(freefall, rushCutoff(freefall));
    this._flap.set(freefall);
    this._flap.setRate(flapRate(freefall));
  }

  dispose(): void {
    this._rush.dispose(LAND_CUT);
    this._flap.dispose(LAND_CUT);
  }
}
