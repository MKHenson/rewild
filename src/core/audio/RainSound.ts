import type { AudioScope, Bed } from 'rewild-audio';
import { rainShare } from 'rewild-renderer/lib/renderers/sky/RainWetness';
import { dripsGain, rainBlend, rainCutoff, rainGain } from './rainMapping';

/** The sky values the rain reads. */
export interface RainWeather {
  precipitation: number;
  temperature: number;
  rainWetness: { film: number };
}

/**
 * The rain: a bed that crossfades light rain into heavy as it falls harder,
 * and drips as the world dries after it. Snow is rain that rainShare turns
 * down, so the bed falls silent in the cold.
 */
export class RainSound {
  private readonly _rain: Bed;
  private readonly _drips: Bed;
  private _share = 0;

  constructor(scope: AudioScope) {
    this._rain = scope.createBed({
      sounds: ['rain-light', 'rain-heavy'],
      bus: 'weather',
      filter: 'lowpass',
      attack: 2,
      release: 4,
    });
    this._drips = scope.createBed({
      sounds: ['rain-drips'],
      bus: 'weather',
      attack: 3,
      release: 6,
    });
  }

  /** 0..1: how hard rain falls at the listener now. */
  get share(): number {
    return this._share;
  }

  update(weather: RainWeather): void {
    const rain = rainShare(weather.precipitation, weather.temperature);
    this._share = rain;
    this._rain.set(rainGain(rain), rainCutoff(rain));
    this._rain.setBlend(rainBlend(rain));
    this._drips.set(dripsGain(weather.rainWetness.film, rain));
  }
}
