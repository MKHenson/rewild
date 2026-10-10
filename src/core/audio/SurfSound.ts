import { Vector3 } from 'rewild-common';
import type { AudioEngine, AudioScope, Emitter } from 'rewild-audio';
import type { ShorePoint } from 'rewild-renderer/lib/renderers/water/ShoreField';
import { createWaterQuerySample } from 'rewild-renderer/lib/renderers/water/WaterQuery';
import { findLapping, LapPoint, WaterSampler } from './lakeShore';
import {
  lapDistanceGain,
  lapLevel,
  seaState,
  surfCalmGain,
  surfDistanceGain,
  surfStormGain,
} from './surfMapping';

/** Seconds between searches for the lapping shoreline. */
const LAP_SEARCH_EVERY = 0.2;
/** Seconds by e an emitter glides toward a new shore point. */
const GLIDE = 0.3;
/** Metres a shore point can jump before its emitter snaps to it. */
const SNAP = 40;
/** Metres above the water the sound comes from. */
const ABOVE_WATER = 1;

/** The water the surf and the lapping read. */
export interface SurfWater {
  /** World height of the sea at rest. */
  readonly seaLevel: number;
  /** The nearest shore the ocean's waves reach (ShoreField.nearestShore). */
  nearestShore(x: number, z: number, out: ShorePoint): boolean;
  sample: WaterSampler;
  /** 0..1 per water palette entry: how strongly it laps (WaterType.lapping). */
  readonly lapping: ArrayLike<number>;
}

/** An emitter that glides toward the shore point it follows. */
class ShoreEmitter {
  readonly at = new Vector3();
  private _placed = false;

  constructor(readonly emitter: Emitter) {}

  follow(x: number, y: number, z: number, seconds: number): void {
    const dx = x - this.at.x;
    const dz = z - this.at.z;
    if (!this._placed || dx * dx + dz * dz > SNAP * SNAP) {
      this.at.set(x, y, z);
      this._placed = true;
    } else {
      const t = 1 - Math.exp(-seconds / GLIDE);
      this.at.set(
        this.at.x + dx * t,
        this.at.y + (y - this.at.y) * t,
        this.at.z + dz * t
      );
    }
    this.emitter.move(this.at);
  }

  /** Silent until placed again, so the next point snaps. */
  silence(): void {
    this.emitter.set(0);
    this._placed = false;
  }
}

/**
 * The water's edge: ocean surf from the nearest shore its waves reach, calm
 * to storm with the sea state, and lapping at the nearest shoreline of water
 * that laps, such as a lake, louder in wind. A lagoon whose water blends lake
 * into ocean laps by its share of lake.
 */
export class SurfSound {
  private readonly _calm: ShoreEmitter;
  private readonly _storm: ShoreEmitter;
  private readonly _lap: ShoreEmitter;
  private readonly _shore: ShorePoint = {
    x: 0,
    z: 0,
    distance: 0,
    strength: 0,
  };
  private readonly _lapPoint: LapPoint = {
    x: 0,
    y: 0,
    z: 0,
    distance: 0,
    lapping: 0,
  };
  private readonly _scratch = createWaterQuerySample();
  private _lapFound = false;
  private _sinceSearch = Infinity;

  constructor(private readonly _engine: AudioEngine, scope: AudioScope) {
    const emitter = (sound: string, priority: number) =>
      new ShoreEmitter(
        scope.createEmitter({
          sound,
          at: new Vector3(),
          gain: 0,
          rolloff: 0,
          priority,
          panning: 'equalpower',
        })
      );
    this._calm = emitter('surf-calm', 3);
    this._storm = emitter('surf-storm', 3);
    this._lap = emitter('lake-lapping', 2);
  }

  update(water: SurfWater, windiness: number, seconds: number): void {
    const listener = this._engine.listenerPosition;
    this._updateSurf(water, listener, windiness, seconds);

    this._sinceSearch += seconds;
    if (this._sinceSearch >= LAP_SEARCH_EVERY) {
      this._sinceSearch = 0;
      this._lapFound = findLapping(
        water.sample,
        listener.x,
        listener.z,
        water.lapping,
        this._scratch,
        this._lapPoint
      );
    }
    if (!this._lapFound) {
      this._lap.silence();
      return;
    }
    const point = this._lapPoint;
    this._lap.follow(point.x, point.y + ABOVE_WATER, point.z, seconds);
    const dx = this._lap.at.x - listener.x;
    const dz = this._lap.at.z - listener.z;
    this._lap.emitter.set(
      lapLevel(point.lapping, windiness) *
        lapDistanceGain(Math.sqrt(dx * dx + dz * dz))
    );
  }

  private _updateSurf(
    water: SurfWater,
    listener: Readonly<Vector3>,
    windiness: number,
    seconds: number
  ): void {
    const shore = this._shore;
    if (!water.nearestShore(listener.x, listener.z, shore)) {
      this._calm.silence();
      this._storm.silence();
      return;
    }
    const y = water.seaLevel + ABOVE_WATER;
    this._calm.follow(shore.x, y, shore.z, seconds);
    this._storm.follow(shore.x, y, shore.z, seconds);
    const dx = this._calm.at.x - listener.x;
    const dz = this._calm.at.z - listener.z;
    const level =
      shore.strength * surfDistanceGain(Math.sqrt(dx * dx + dz * dz));
    const sea = seaState(windiness);
    this._calm.emitter.set(level * surfCalmGain(sea));
    this._storm.emitter.set(level * surfStormGain(sea));
  }
}
