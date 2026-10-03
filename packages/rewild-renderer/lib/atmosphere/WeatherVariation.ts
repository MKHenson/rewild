import { smootherstep, smoothstep } from 'rewild-common';
import { WeatherRandom } from './WeatherRandom';
import { WeatherKnobs, WeatherVariationDef } from './WeatherTypes';

const CHANNELS = 6;
const BEARING = 5;
const CHANNEL_KEYS = [
  'cloudiness',
  'windiness',
  'precipitation',
  'fog',
  'temperature',
  'bearing',
] as const;

/** Per second: how fast a new state's variation replaces the last one's. */
const AMPLITUDE_RATE = 0.1;

/**
 * Keeps a state from holding still: each output wanders on its own slow
 * curve, and some states throw short bursts that swing the wind and lash the
 * rain. Offsets are added after the knobs are smoothed, so a burst arrives in
 * seconds rather than at the knobs' follow rates.
 */
export class WeatherVariation {
  /** Degrees the wind is turned from the weather's bearing. */
  bearing = 0;
  /** 0..1, how far into its swing the current burst is. */
  burstEnvelope = 0;

  private readonly amplitude = new Float64Array(CHANNELS);
  private readonly from = new Float64Array(CHANNELS);
  private readonly to = new Float64Array(CHANNELS);
  private readonly elapsed = new Float64Array(CHANNELS);
  private readonly period = new Float64Array(CHANNELS).fill(1);
  private readonly offset = new Float64Array(CHANNELS);

  private burstActive = false;
  private burstElapsed = 0;
  private burstDuration = 0;
  private burstBearing = 0;
  private burstWind = 0;
  private burstRain = 0;
  private nextBurstIn = Infinity;

  constructor(private readonly rng: WeatherRandom) {}

  reset(def: WeatherVariationDef, scale: number): void {
    for (let i = 0; i < CHANNELS; i++) {
      this.amplitude[i] = (def.wander[CHANNEL_KEYS[i]] ?? 0) * scale;
      this.from[i] = 0;
      this.to[i] = this.rng.between(-1, 1);
      this.elapsed[i] = 0;
      this.period[i] = this.rng.in(def.wanderPeriod);
      this.offset[i] = 0;
    }
    this.burstActive = false;
    this.burstEnvelope = 0;
    this.bearing = 0;
    this.enterState(def);
  }

  /** Schedules the new state's bursts. A burst under way plays out. */
  enterState(def: WeatherVariationDef): void {
    this.nextBurstIn = def.burst ? this.rng.in(def.burst.every) : Infinity;
  }

  update(def: WeatherVariationDef, scale: number, deltaSeconds: number): void {
    const ease = 1 - Math.exp(-AMPLITUDE_RATE * deltaSeconds);
    for (let i = 0; i < CHANNELS; i++) {
      const target = (def.wander[CHANNEL_KEYS[i]] ?? 0) * scale;
      this.amplitude[i] += (target - this.amplitude[i]) * ease;

      this.elapsed[i] += deltaSeconds;
      if (this.elapsed[i] >= this.period[i]) {
        this.elapsed[i] = 0;
        this.from[i] = this.to[i];
        this.to[i] = this.rng.between(-1, 1);
        this.period[i] = this.rng.in(def.wanderPeriod);
      }
      const t = smootherstep(this.elapsed[i] / this.period[i], 0, 1);
      this.offset[i] =
        (this.from[i] + (this.to[i] - this.from[i]) * t) * this.amplitude[i];
    }

    this.updateBurst(def, scale, deltaSeconds);
    this.bearing =
      this.offset[BEARING] + this.burstBearing * this.burstEnvelope;
  }

  /** Adds the variation to `knobs` in place. Rain varies only where it falls. */
  apply(knobs: WeatherKnobs): void {
    const offset = this.offset;
    const envelope = this.burstEnvelope;
    const raining = smoothstep(knobs.precipitation, 0, 0.1);
    knobs.cloudiness = saturate(knobs.cloudiness + offset[0]);
    knobs.windiness = saturate(
      knobs.windiness + offset[1] + this.burstWind * envelope
    );
    knobs.precipitation = saturate(
      knobs.precipitation +
        (offset[2] + this.burstRain * envelope) * raining
    );
    knobs.fog = saturate(knobs.fog + offset[3]);
    knobs.temperature = saturate(knobs.temperature + offset[4]);
  }

  private updateBurst(
    def: WeatherVariationDef,
    scale: number,
    deltaSeconds: number
  ): void {
    if (this.burstActive) {
      this.burstElapsed += deltaSeconds;
      const t = this.burstElapsed / this.burstDuration;
      if (t >= 1) {
        this.burstActive = false;
        this.burstEnvelope = 0;
      } else {
        this.burstEnvelope =
          smoothstep(t, 0, 0.3) * (1 - smoothstep(t, 0.6, 1));
      }
      return;
    }

    const burst = def.burst;
    if (!burst) return;
    this.nextBurstIn -= deltaSeconds;
    if (this.nextBurstIn > 0) return;

    const rng = this.rng;
    this.burstActive = true;
    this.burstElapsed = 0;
    this.burstDuration = Math.max(0.5, rng.in(burst.duration));
    this.burstBearing = rng.sign() * rng.in(burst.bearing) * scale;
    this.burstWind = rng.in(burst.windiness) * scale;
    this.burstRain = rng.in(burst.precipitation) * scale;
    this.nextBurstIn = rng.in(burst.every);
  }
}

function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
