import type { AudioEngine, AudioScope, Bed } from 'rewild-audio';
import { createWaterQuerySample } from 'rewild-renderer/lib/renderers/water/WaterQuery';
import type { WaterSampler } from './lakeShore';
import { openSeaGain, seaState } from './surfMapping';

/** Seconds between reads of the water under the listener. */
const SAMPLE_EVERY = 0.2;

/** The water the open sea reads. */
export interface SeaWater {
  sample: WaterSampler;
  /** 0..1 per water palette entry: how much of it is the ocean. */
  readonly ocean: ArrayLike<number>;
}

/**
 * The open sea all around the listener over the ocean, far from any shore:
 * swell and slosh, calm to storm with the sea state, fading out as the
 * listener rises above it. The surf plays the shore.
 */
export class OpenSeaSound {
  private readonly _bed: Bed;
  private readonly _sample = createWaterQuerySample();
  private _ocean = 0;
  private _level = 0;
  private _sinceSample = Infinity;

  constructor(private readonly _engine: AudioEngine, scope: AudioScope) {
    this._bed = scope.createBed({
      sounds: ['sea-calm', 'sea-storm'],
      bus: 'ambience',
      attack: 1.5,
      release: 3,
    });
  }

  update(water: SeaWater, windiness: number, seconds: number): void {
    const listener = this._engine.listenerPosition;
    this._sinceSample += seconds;
    if (this._sinceSample >= SAMPLE_EVERY) {
      this._sinceSample = 0;
      const s = this._sample;
      this._ocean = 0;
      if (water.sample(listener.x, listener.z, s) && s.wet) {
        for (let c = 0; c < water.ocean.length; c++)
          this._ocean += s.typeWeights[c] * water.ocean[c];
        this._ocean *= s.coverage;
        this._level = s.level;
      }
    }
    const sea = seaState(windiness);
    this._bed.setBlend(sea);
    this._bed.set(
      this._ocean > 0
        ? openSeaGain(listener.y - this._level, this._ocean, sea)
        : 0
    );
  }
}
