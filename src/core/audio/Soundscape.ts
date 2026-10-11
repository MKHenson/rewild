import { OPEN_CUTOFF_HZ, RuleSet, RuleSignals, STATE_EASE } from 'rewild-audio';
import type { AudioScope, Bed, RuleSetDef } from 'rewild-audio';
import { smoothstep } from 'rewild-common';
import { WEATHER_STATE_IDS } from 'rewild-renderer/lib/atmosphere/WeatherStates';
import type { WeatherStateId } from 'rewild-renderer/lib/atmosphere/WeatherTypes';
import type { ClimateConfig } from 'rewild-renderer/lib/renderers/terrain/Biomes';

/** The profile every biome's profile extends. */
export const BASE_PROFILE = '*';

/** `templates/soundscapes.json`: a profile per biome name, and the base profile under `"*"`. */
export type SoundscapesDef = Readonly<Record<string, RuleSetDef>>;

export const SOUNDSCAPE_SIGNALS = {
  numbers: [
    'windiness',
    'gust',
    'rain',
    'snow',
    'wetness',
    'fog',
    'cloudiness',
    'sun',
    'dawn',
    'moon',
  ],
  states: { state: WEATHER_STATE_IDS },
} as const;

/** The weather at the listener, as the soundscape reads it. */
export interface SoundscapeWeather {
  windiness: number;
  /** 0..1: the gust at the listener. */
  gust: number;
  /** 0..1: how hard rain falls. */
  rain: number;
  /** 0..1: how hard snow falls. */
  snow: number;
  /** 0..1: how wet the world is, so it can drip after the rain. */
  wetness: number;
  fog: number;
  cloudiness: number;
  /** -1..1: the sun's height, 0 at the horizon. */
  sun: number;
  dawn: boolean;
  /** 0..1: the moon's light while it is the key light. */
  moon: number;
  state: WeatherStateId;
}

/** The biomes at the listener. `BiomeProbe` is one. */
export interface SoundscapeBiomes {
  readonly climate: ClimateConfig | null;
  readonly count: number;
  readonly biomes: Int32Array | null;
  readonly weights: Float64Array | null;
}

/** Bed fade-in and fade-out, seconds, over the biome probe's steps. */
const ATTACK = 2;
const RELEASE = 4;

/**
 * Each biome's sound, changed by the weather. Every profile compiles once into
 * a RuleSet over the base profile's rules. Each frame the profiles of the
 * biomes at the listener give a gain and a cutoff per sound; the gains, times
 * each biome's weight, sum, and the lowest cutoff wins. One bed per sound, on
 * the ambience bus.
 */
export class Soundscape {
  /** The soundscape last made, for the console. */
  static current: Soundscape | null = null;

  readonly signals = new RuleSignals(SOUNDSCAPE_SIGNALS);
  /** Profile names, in the order of `profiles`. */
  readonly names: readonly string[];
  readonly profiles: readonly RuleSet[];
  /** Each profile's share of the listener's ground at the last update. */
  readonly profileWeights: Float32Array;
  /** Every sound the profiles play, in the order of `gains` and `cutoffs`. */
  readonly sounds: readonly string[];
  readonly gains: Float32Array;
  readonly cutoffs: Float32Array;

  private readonly _beds: Bed[];
  private readonly _slotSounds: Int32Array[];
  private _climate: ClimateConfig | null = null;
  private _byBiome = new Int32Array(0);
  private _dawn = 0;
  private _settled = false;

  /** Throws, naming the profile, on a bad rule. */
  constructor(def: SoundscapesDef, scope: AudioScope) {
    const base = def[BASE_PROFILE];
    this.names = Object.keys(def).filter((name) => name !== BASE_PROFILE);
    this.profiles = this.names.map((name) => {
      try {
        return new RuleSet(this.signals, def[name], base);
      } catch (e) {
        throw new Error(`soundscape "${name}": ${(e as Error).message}`);
      }
    });
    this.profileWeights = new Float32Array(this.profiles.length);

    const sounds: string[] = [];
    this._slotSounds = this.profiles.map(
      (set) =>
        new Int32Array(
          set.slotSounds.map((sound) => {
            const i = sounds.indexOf(sound);
            return i >= 0 ? i : sounds.push(sound) - 1;
          })
        )
    );
    this.sounds = sounds;
    this.gains = new Float32Array(sounds.length);
    this.cutoffs = new Float32Array(sounds.length).fill(OPEN_CUTOFF_HZ);
    this._beds = sounds.map((sound) =>
      scope.createBed({
        sounds: [sound],
        bus: 'ambience',
        filter: 'lowpass',
        attack: ATTACK,
        release: RELEASE,
      })
    );
    Soundscape.current = this;
  }

  update(
    weather: SoundscapeWeather,
    biomes: SoundscapeBiomes,
    seconds: number
  ): void {
    const signals = this.signals;
    signals.set('windiness', weather.windiness);
    signals.set('gust', weather.gust);
    signals.set('rain', weather.rain);
    signals.set('snow', weather.snow);
    signals.set('wetness', weather.wetness);
    signals.set('fog', weather.fog);
    signals.set('cloudiness', weather.cloudiness);
    signals.set('sun', weather.sun);
    signals.set('moon', weather.moon);
    signals.setState('state', weather.state);

    const dawn = weather.dawn ? 1 : 0;
    if (this._settled) {
      signals.update(seconds);
      const step = seconds / STATE_EASE;
      this._dawn =
        dawn > this._dawn
          ? Math.min(dawn, this._dawn + step)
          : Math.max(dawn, this._dawn - step);
    } else {
      signals.settle();
      this._dawn = dawn;
      this._settled = true;
    }
    signals.set('dawn', smoothstep(this._dawn, 0, 1));

    if (biomes.climate !== this._climate) this._mapBiomes(biomes.climate);
    const profileWeights = this.profileWeights;
    profileWeights.fill(0);
    const ids = biomes.biomes;
    const weights = biomes.weights;
    if (ids && weights)
      for (let i = 0; i < biomes.count; i++) {
        const p = this._byBiome[ids[i]];
        if (p >= 0) profileWeights[p] += weights[i];
      }

    const gains = this.gains;
    const cutoffs = this.cutoffs;
    gains.fill(0);
    cutoffs.fill(OPEN_CUTOFF_HZ);
    for (let p = 0; p < this.profiles.length; p++) {
      const weight = profileWeights[p];
      if (weight <= 0) continue;
      const set = this.profiles[p];
      set.evaluate();
      const slotSounds = this._slotSounds[p];
      for (let slot = 0; slot < slotSounds.length; slot++) {
        const gain = set.gains[slot] * weight;
        if (gain <= 0) continue;
        const k = slotSounds[slot];
        gains[k] += gain;
        if (set.cutoffs[slot] < cutoffs[k]) cutoffs[k] = set.cutoffs[slot];
      }
    }
    for (let k = 0; k < this._beds.length; k++)
      this._beds[k].set(gains[k], cutoffs[k]);
  }

  dispose(fade: number = RELEASE): void {
    if (Soundscape.current === this) Soundscape.current = null;
    for (const bed of this._beds) bed.dispose(fade);
  }

  /** Points each of the climate's biomes at its profile, or none. */
  private _mapBiomes(climate: ClimateConfig | null): void {
    this._climate = climate;
    const biomes = climate?.biomes ?? [];
    this._byBiome = new Int32Array(biomes.length);
    biomes.forEach(
      (biome, i) => (this._byBiome[i] = this.names.indexOf(biome.name))
    );
  }
}
