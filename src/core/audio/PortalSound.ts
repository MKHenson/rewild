import type { Vector3 } from 'rewild-common';
import type { AudioEngine, AudioScope, Emitter } from 'rewild-audio';
import { REF_DISTANCE } from 'rewild-audio';

export const PORTAL_HUM = 'portal-hum';
export const PORTAL_OPEN = 'portal-open';
export const PORTAL_TRAVEL = 'portal-travel';

/** The hum's level at the portal's surface while it is closed. */
export const HUM_GAIN = 1.8;
/** How much louder the hum is once the portal is fully open. */
export const HUM_OPEN_BOOST = 2;
/** The opening's level. */
export const OPEN_GAIN = 2.5;
/** How fast the hum fades with distance: under 1 carries further than most. */
const HUM_ROLLOFF = 0.6;
/** Ranks the hum above ambience, so it keeps its voice near a busy shore. */
const HUM_PRIORITY = 3;

/**
 * The hum's gain for a portal of `radius`. The engine fades a sound from its
 * centre, so this lifts it by the fade from the centre to the surface, and the
 * hum is HUM_GAIN wherever a player can stand next to it.
 */
export function humGain(radius: number): number {
  const beyond = Math.max(radius - REF_DISTANCE, 0);
  return (HUM_GAIN * (REF_DISTANCE + HUM_ROLLOFF * beyond)) / REF_DISTANCE;
}

/**
 * A portal's sounds. It hums from its centre while it stands and bursts as it
 * opens, both in 3D on the effects bus. Going through plays in 2D on the
 * player bus, on the engine rather than the game's scope, so it carries on
 * while the next level loads.
 */
export class PortalSound {
  private _hum: Emitter | null = null;
  private _humGain = 0;
  private _openness = 0;

  constructor(
    private readonly _scope: Pick<AudioScope, 'play' | 'createEmitter'>,
    private readonly _engine: Pick<AudioEngine, 'play'>
  ) {}

  /** Starts the hum at `at`, the centre of a portal of `radius`, or moves it there. */
  hum(at: Vector3, radius: number): void {
    this._humGain = humGain(radius);
    const gain = this.openHumGain;
    if (this._hum) {
      this._hum.move(at);
      this._hum.set(gain);
    } else
      this._hum = this._scope.createEmitter({
        sound: PORTAL_HUM,
        at,
        bus: 'effects',
        gain,
        rolloff: HUM_ROLLOFF,
        priority: HUM_PRIORITY,
      });
  }

  /** Raises the hum as the portal opens: 0 closed, 1 fully open. */
  setOpenness(openness: number): void {
    if (openness === this._openness) return;
    this._openness = openness;
    this._hum?.set(this.openHumGain);
  }

  /** Plays the portal opening at `at`. */
  open(at: Vector3): void {
    this._scope.play(PORTAL_OPEN, {
      at,
      bus: 'effects',
      gain: OPEN_GAIN,
      priority: 4,
    });
  }

  private get openHumGain(): number {
    return this._humGain * (1 + (HUM_OPEN_BOOST - 1) * this._openness);
  }

  travel(): void {
    this._engine.play(PORTAL_TRAVEL, { bus: 'player' });
  }

  dispose(): void {
    this._hum?.dispose();
    this._hum = null;
  }
}
