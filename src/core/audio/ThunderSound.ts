import { Vector3 } from 'rewild-common';
import type { AudioEngine, AudioScope, PlayOptions } from 'rewild-audio';
import type { StrikeQueue } from 'rewild-renderer/lib/renderers/sky/StrikeQueue';
import type { WindState } from 'rewild-renderer/lib/renderers/sky/WindState';
import {
  THUNDER_LATE_BY,
  ThunderSoundName,
  thunderCutoff,
  thunderDelay,
  thunderDuck,
  thunderDuckHold,
  thunderDuckLevel,
  thunderGain,
  thunderSound,
} from './thunderMapping';

/** Metres from the listener thunder plays, in the strike's direction. The game sets its distance curve. */
const PANNER_DISTANCE = 50;

/** Seconds between the low rumbles of a coming storm, at least and at most. */
const RUMBLE_EVERY: [number, number] = [30, 90];
const RUMBLE_GAIN = 0.75;
const RUMBLE_CUTOFF = 500;

/** Thunders whose duck is tracked at once. A new one replaces the oldest. */
const DUCK_SLOTS = 8;

/** Seconds by e the ducked buses follow the duck. */
const DUCK_FOLLOW = 0.05;

/**
 * Thunder: drains the lightning's strike queue and plays each strike from its
 * direction, late by its distance at the speed of sound, quieter and deeper
 * the further it is. As each thunder arrives it ducks the rain, the wind and
 * the land, so it cuts through them. Before a storm, a rare low rumble with no
 * bolt comes from upwind, where the storm is.
 */
export class ThunderSound {
  private readonly _options: PlayOptions & { at: Vector3 } = {
    at: new Vector3(),
    bus: 'effects',
    rolloff: 0,
    panning: 'equalpower',
    gain: 1,
    cutoff: 20000,
    delay: 0,
    priority: 5,
  };
  private _rumbleIn = -1;

  /** Each tracked thunder's arrival on the strike clock, its hold and its duck level. */
  private readonly _arrives = new Float64Array(DUCK_SLOTS).fill(-Infinity);
  private readonly _holds = new Float32Array(DUCK_SLOTS);
  private readonly _levels = new Float32Array(DUCK_SLOTS).fill(1);
  private _nextSlot = 0;
  private _duck = 1;

  constructor(
    private readonly _engine: AudioEngine,
    private readonly _scope: AudioScope,
    private readonly _random: () => number = Math.random
  ) {}

  /** The level the world's other sounds are ducked to now: 1 is not at all. */
  get duck(): number {
    return this._duck;
  }

  /**
   * @param strikes  The lightning's strike queue.
   * @param wind     The sky's wind, for where a coming storm is.
   * @param stormComing  True while a front approaches.
   */
  update(
    strikes: StrikeQueue,
    wind: WindState,
    stormComing: boolean,
    seconds: number
  ): void {
    const listener = this._engine.listenerPosition;
    const now = strikes.now();
    const options = this._options;

    for (let strike = strikes.pop(); strike; strike = strikes.pop()) {
      const dx = strike.x - listener.x;
      const dz = strike.z - listener.z;
      const distance = Math.hypot(dx, dz);
      const delay = thunderDelay(distance, now - strike.time);
      if (delay < -THUNDER_LATE_BY) continue;

      const sound = thunderSound(distance, strike.chain);
      options.delay = Math.max(0, delay);
      options.gain = thunderGain(distance);
      options.cutoff = thunderCutoff(distance);
      this._place(dx, dz, distance);
      if (this._scope.play(sound, options))
        this._track(now + options.delay, sound, options.gain);
    }

    this._updateDuck(now);
    this._updateRumble(wind, stormComing, seconds);
  }

  private _track(
    arrives: number,
    sound: ThunderSoundName,
    gain: number
  ): void {
    const slot = this._nextSlot;
    this._nextSlot = (slot + 1) % DUCK_SLOTS;
    this._arrives[slot] = arrives;
    this._holds[slot] = thunderDuckHold(sound);
    this._levels[slot] = thunderDuckLevel(gain);
  }

  private _updateDuck(now: number): void {
    let duck = 1;
    for (let i = 0; i < DUCK_SLOTS; i++)
      duck = Math.min(
        duck,
        thunderDuck(now - this._arrives[i], this._holds[i], this._levels[i])
      );
    if (duck > 0.999) duck = 1;
    this._duck = duck;
    this._engine.duckBus('weather', duck, DUCK_FOLLOW);
    this._engine.duckBus('ambience', duck, DUCK_FOLLOW);
  }

  private _updateRumble(
    wind: WindState,
    stormComing: boolean,
    seconds: number
  ): void {
    if (!stormComing) {
      this._rumbleIn = -1;
      return;
    }
    if (this._rumbleIn < 0) this._rumbleIn = this._rumbleGap();
    this._rumbleIn -= seconds;
    if (this._rumbleIn > 0) return;

    this._rumbleIn = this._rumbleGap();
    const options = this._options;
    const vec = wind.vec;
    options.delay = 0;
    options.gain = RUMBLE_GAIN;
    options.cutoff = RUMBLE_CUTOFF;
    this._place(-vec[0], -vec[1], Math.hypot(vec[0], vec[1]));
    this._scope.play('thunder-far', options);
  }

  /** Puts the play position `PANNER_DISTANCE` from the listener toward (`dx`, `dz`). */
  private _place(dx: number, dz: number, length: number): void {
    const listener = this._engine.listenerPosition;
    const scale = length > 1e-4 ? PANNER_DISTANCE / length : 0;
    this._options.at.set(
      listener.x + dx * scale,
      listener.y,
      listener.z + dz * scale
    );
  }

  private _rumbleGap(): number {
    const [least, most] = RUMBLE_EVERY;
    return least + (most - least) * this._random();
  }
}
