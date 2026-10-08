import { Vector3 } from 'rewild-common';
import type { AudioEngine, PlayOptions } from './AudioEngine';
import { BusName } from './Buses';
import { OPEN_CUTOFF_HZ } from './constants';

export interface EmitterSpec {
  sound: string;
  at: Vector3;
  bus?: BusName;
  gain?: number;
  cutoff?: number;
  /** How fast it fades with distance. See `PlayOptions.rolloff`. */
  rolloff?: number;
  /** Multiplies its loudness when voices are ranked, so it is stolen last. */
  priority?: number;
}

export type EmitterState = 'playing' | 'virtual';

/** Heard gain at which a virtual emitter takes a voice: -40 dB. */
export const EMITTER_ACQUIRE = 0.01;
/** Heard gain below which a playing emitter gives its voice back: -46 dB. */
export const EMITTER_RELEASE = 0.005;
/** Seconds to fade in on taking a voice and out on giving it back. */
export const EMITTER_FADE = 0.25;

const LEVEL_TIME_CONSTANT = 0.05;

/**
 * A looping sound that belongs to a place, such as a waterfall. It always
 * exists, but holds one of the engine's 3D voices only while it can be heard.
 * Out of earshot, or when a louder sound takes its voice, it goes virtual:
 * silent, but still tracking its position and gain. `AudioEngine.update` brings
 * it back when it can be heard again, starting at a random point in the loop
 * so the gap does not show.
 */
export class Emitter {
  readonly sound: string;

  private readonly _at = new Vector3();
  private _gain: number;
  private _cutoff: number;
  private _voice = 0;
  private readonly _options: PlayOptions & { at: Vector3 };

  constructor(private readonly _engine: AudioEngine, spec: EmitterSpec) {
    this.sound = spec.sound;
    this._at.copy(spec.at);
    this._gain = spec.gain ?? 1;
    this._cutoff = spec.cutoff ?? OPEN_CUTOFF_HZ;
    this._options = {
      at: this._at,
      bus: spec.bus ?? 'ambience',
      gain: this._gain,
      cutoff: this._cutoff,
      rolloff: spec.rolloff ?? 1,
      priority: spec.priority ?? 1,
      fadeIn: EMITTER_FADE,
      offset: 0,
    };
  }

  get at(): Readonly<Vector3> {
    return this._at;
  }

  get gain(): number {
    return this._gain;
  }

  get state(): EmitterState {
    return this._voice ? 'playing' : 'virtual';
  }

  /** The gain at the listener: its own gain times the distance curve. */
  get heard(): number {
    return (
      this._gain * this._engine.distanceGain(this._at, this._options.rolloff!)
    );
  }

  move(at: Vector3): void {
    this._at.copy(at);
    if (this._voice) this._engine.move(this._voice, this._at);
  }

  /** Changes its gain and cutoff. Gain 0 sends it virtual on the next update. */
  set(gain: number, cutoff?: number): void {
    this._gain = gain;
    if (cutoff !== undefined) this._cutoff = cutoff;
    this._options.gain = gain;
    this._options.cutoff = this._cutoff;
    if (this._voice)
      this._engine.setVoiceLevel(
        this._voice,
        gain,
        this._cutoff,
        LEVEL_TIME_CONSTANT
      );
  }

  /** Takes or gives back a voice as it moves in and out of earshot. Called by `AudioEngine.update`. */
  update(): void {
    if (this._voice && !this._engine.isPlaying(this._voice)) this._voice = 0;

    const heard = this.heard;
    if (this._voice) {
      if (heard < EMITTER_RELEASE) this._giveBack();
    } else if (heard >= EMITTER_ACQUIRE) {
      this._options.offset = Math.random();
      this._voice = this._engine.loop(this.sound, this._options);
    }
  }

  dispose(): void {
    this._giveBack();
    this._engine.forgetEmitter(this);
  }

  private _giveBack(): void {
    if (!this._voice) return;
    this._engine.stop(this._voice, EMITTER_FADE);
    this._voice = 0;
  }
}
