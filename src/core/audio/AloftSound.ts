import { smoothstep } from 'rewild-common';
import type { AudioEngine, AudioScope, Bed } from 'rewild-audio';
import {
  CLOUD_HEIGHT,
  CLOUD_START,
  CLOUD_TOP,
} from 'rewild-renderer/lib/renderers/sky/CloudDeck';

/** Listener altitude in world metres at which the world below starts to fade,
 *  half way up the cloud deck, and at which only the aloft loop is left. */
export const ALOFT_FROM = CLOUD_START + CLOUD_HEIGHT / 2;
export const ALOFT_FULL = CLOUD_TOP + 100;

/** 0..1: how far above the world a listener at world `y` is. */
export function aloftShare(y: number): number {
  return smoothstep(y, ALOFT_FROM, ALOFT_FULL);
}

/**
 * High above the clouds: a distant loop that rises as the listener climbs
 * through the deck. On the world bus, past the ducks WorldSound fades the
 * world below with.
 */
export class AloftSound {
  private readonly _bed: Bed;
  private _share = 0;

  constructor(
    private readonly _engine: Pick<AudioEngine, 'listenerPosition'>,
    scope: Pick<AudioScope, 'createBed'>
  ) {
    this._bed = scope.createBed({
      sounds: ['aloft'],
      bus: 'world',
      attack: 2,
      release: 2,
    });
  }

  /** 0..1: aloftShare at the listener now. */
  get share(): number {
    return this._share;
  }

  update(): void {
    this._share = aloftShare(this._engine.listenerPosition.y);
    this._bed.set(this._share);
  }
}
