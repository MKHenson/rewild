import { Vector3 } from 'rewild-common';
import type {
  AudioEngine,
  AudioScope,
  Bed,
  Emitter,
  PlayOptions,
} from 'rewild-audio';
import {
  gustField,
  gustShare,
} from 'rewild-renderer/lib/renderers/sky/GustField';
import type { WindState } from 'rewild-renderer/lib/renderers/sky/WindState';
import {
  followGust,
  windFacing,
} from 'rewild-renderer/lib/renderers/water/WaterLens';
import {
  airBlend,
  airCutoff,
  airGain,
  earsGain,
  gustShotGain,
} from './windMapping';

/** Metres upwind of the listener the roar in the ears comes from. */
const EARS_DISTANCE = 10;
/** Metres upwind of the listener a gust one-shot comes from. */
const GUST_DISTANCE = 15;
/** The gust share at the listener that plays a one-shot, and the lull it must
 *  fall below before another can play. */
const GUST_SHOT_AT = 0.5;
const GUST_REARM_AT = 0.3;
/** Seconds between gust one-shots, at least. */
const GUST_SHOT_GAP = 3;

/** 0..1: how hard a gust blows at world (`x`, `z`). */
export type GustAt = (x: number, z: number, drift: ArrayLike<number>) => number;

/** The gusts the trees bend to (GustField). */
const fieldGust: GustAt = (x, z, drift) => gustShare(gustField(x, z, drift));

/**
 * The wind: an air bed that follows the windiness and the gusts, a roar in the
 * ears from upwind when facing into a gale, and one-shot gusts as the gust
 * field surges past the listener — the same gusts the trees bend to.
 */
export class WindSound {
  private readonly _air: Bed;
  private readonly _ears: Emitter;
  private readonly _upwind = new Vector3(1, 0, 0);
  private readonly _earsAt = new Vector3();
  private readonly _gustOptions: PlayOptions & { at: Vector3 } = {
    at: new Vector3(),
    bus: 'weather',
    rolloff: 0,
    gain: 1,
    priority: 2,
    panning: 'equalpower',
  };

  private _envelope = 0;
  private _armed = true;
  private _sinceShot = Infinity;

  constructor(
    private readonly _engine: AudioEngine,
    private readonly _scope: AudioScope,
    private readonly _gustAt: GustAt = fieldGust
  ) {
    this._air = _scope.createBed({
      sounds: ['wind-0', 'wind-1', 'wind-2'],
      bus: 'weather',
      filter: 'lowpass',
      attack: 1.5,
      release: 3,
    });
    this._ears = _scope.createEmitter({
      sound: 'wind-ears',
      at: new Vector3(),
      bus: 'weather',
      gain: 0,
      rolloff: 0,
      priority: 4,
      panning: 'equalpower',
    });
  }

  /** The gust envelope at the listener: quick to rise, slow to fall. */
  get envelope(): number {
    return this._envelope;
  }

  update(wind: WindState, seconds: number): void {
    const vec = wind.vec;
    const windiness = vec[2];
    const listener = this._engine.listenerPosition;
    const forward = this._engine.listenerForward;

    const gust = this._gustAt(listener.x, listener.z, wind.gustDrift);
    this._envelope = followGust(this._envelope, gust, seconds);

    this._air.set(airGain(windiness, gust), airCutoff(windiness));
    this._air.setBlend(airBlend(windiness));

    const airLength = Math.hypot(vec[0], vec[1]);
    if (airLength > 1e-4)
      this._upwind.set(-vec[0] / airLength, 0, -vec[1] / airLength);

    const facing = windFacing(forward.x, forward.z, vec[0], vec[1]);
    this._ears.move(this._at(EARS_DISTANCE, this._earsAt));
    this._ears.set(earsGain(windiness, facing, this._envelope));

    this._sinceShot += seconds;
    if (gust < GUST_REARM_AT) this._armed = true;
    const level = gustShotGain(windiness);
    if (
      this._armed &&
      gust >= GUST_SHOT_AT &&
      level > 0 &&
      this._sinceShot >= GUST_SHOT_GAP
    ) {
      this._armed = false;
      this._sinceShot = 0;
      this._gustOptions.gain = level;
      this._at(GUST_DISTANCE, this._gustOptions.at);
      this._scope.play('wind-gust', this._gustOptions);
    }
  }

  /** The point `distance` metres upwind of the listener, written to `out`. */
  private _at(distance: number, out: Vector3): Vector3 {
    const listener = this._engine.listenerPosition;
    out.set(
      listener.x + this._upwind.x * distance,
      listener.y,
      listener.z + this._upwind.z * distance
    );
    return out;
  }
}
