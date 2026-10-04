import { smoothstep } from 'rewild-common';
import { AtmosphereModifiers } from './AtmosphereModifiers';
import { resolveWeatherClimate } from './ClimateProfiles';
import {
  DayNightCycle,
  dayPeriod,
  isDawn,
  isDusk,
  wrapDegrees,
} from './DayNightCycle';
import { deriveKnobs, gustNoise } from './WeatherDerivation';
import { WeatherRandom } from './WeatherRandom';
import { WEATHER_STATES, WEATHER_STATE_IDS } from './WeatherStates';
import {
  AtmosphereModifier,
  AtmosphereStart,
  ClimateProfile,
  copyKnobs,
  createKnobs,
  Drivers,
  ForecastEntry,
  KNOB_IDS,
  WeatherRange,
  WeatherKnobs,
  WeatherSample,
  WeatherStateDef,
  WeatherStateId,
} from './WeatherTypes';
import { WeatherVariation } from './WeatherVariation';

/** Per second: how fast the wind's pressure trend follows the pressure. */
const TREND_RATE = 0.3;
/** Per cycle: how fast the prevailing wind turns to a new bearing. */
const PREVAILING_RATE = 2;

interface UpcomingState {
  state: WeatherStateId;
  duration: number;
}

/**
 * Runs the day/night cycle and the weather. A named state sets ranges for
 * three hidden drivers (pressure, moisture, instability); the drivers ease
 * toward targets in those ranges, and the knobs the sky reads are derived from
 * them, so the knobs always agree. On top: the wind's bearing, which follows
 * a slowly wandering prevailing wind and turns as fronts pass; a variation
 * layer that keeps a state from holding still; and gameplay modifiers.
 *
 * Weather time is counted in day cycles, so a longer cycle gives longer
 * weather. The same seed and start give the same sequence of states.
 */
export class AtmosphereSystem {
  readonly cycle = new DayNightCycle();
  readonly modifiers = new AtmosphereModifiers();
  /** Set by the sky's day/night switch. When false nothing here runs. */
  running = false;
  /** Pause the weather too while the cycle is paused. */
  weatherPausesWithCycle = false;
  forecastLength = 3;

  climate: ClimateProfile = resolveWeatherClimate(undefined);
  seed = 0;

  state: WeatherStateId = 'Fair';
  stateElapsed = 0;
  stateDuration = 1;

  readonly drivers: Drivers = { pressure: 0.6, moisture: 0.4, instability: 0.1 };
  readonly driverTargets: Drivers = { ...this.drivers };
  /** 0..1, the smoothed rate of pressure change against the climate's most. */
  pressureTrend = 0;
  /** The knobs the drivers give this tick, before smoothing. */
  readonly raw: WeatherKnobs = createKnobs();
  /** The smoothed knobs, or the knobs a script wrote while disabled. */
  readonly base: WeatherKnobs = createKnobs();
  readonly sample: WeatherSample = {
    ...createKnobs(),
    state: 'Fair',
    stateProgress: 0,
    windBearing: 180,
    elevation: 80,
    baseKnobs: createKnobs(),
  };

  /** Degrees the air moves toward, before the variation's swings. */
  bearing = 180;
  private startBearing = 180;
  private prevailing = 180;
  private prevailingTarget = 180;
  private stateBearingOffset = 0;

  private start: AtmosphereStart | null = null;
  private enabled = true;
  private time = 0;
  private nextRetarget = 0;
  private previousPressure = 0.6;
  private readonly upcoming: UpcomingState[] = [];

  private stateRng = new WeatherRandom(0);
  private targetRng = new WeatherRandom(0);
  private variationRng = new WeatherRandom(0);
  private variation = new WeatherVariation(this.variationRng);

  /** Starts the weather from the authored sky and turns the system on. */
  init(climate: ClimateProfile, seed: number, start: AtmosphereStart): void {
    this.climate = climate;
    this.seed = seed;
    this.start = { ...start };
    this.stateRng = new WeatherRandom(seed ^ 0x9e3779b9);
    this.targetRng = new WeatherRandom(seed ^ 0x85ebca6b);
    this.variationRng = new WeatherRandom(seed ^ 0xc2b2ae35);
    this.variation = new WeatherVariation(this.variationRng);

    this.cycle.elevation = start.elevation;
    copyKnobs(start, this.base);
    copyKnobs(start, this.raw);

    const bearing = wrapDegrees(start.windBearing);
    this.startBearing = bearing;
    this.prevailing = bearing;
    this.prevailingTarget = bearing;
    this.bearing = bearing;

    this.enabled = true;
    this.time = 0;
    this.pressureTrend = 0;
    this.upcoming.length = 0;

    const state = start.state ?? this.nearestState(start);
    this.enterState(state, this.pickDuration(state));
    this.prevailingTarget = bearing;
    this.snapDrivers();
    this.fillUpcoming(this.forecastLength);
    this.variation.reset(
      WEATHER_STATES[state].variation,
      this.climate.variationScale
    );

    this.running = true;
    this.writeSample();
  }

  update(deltaSeconds: number): WeatherSample {
    this.cycle.advance(deltaSeconds);
    const weatherSeconds =
      this.weatherPausesWithCycle && this.cycle.paused ? 0 : deltaSeconds;
    if (this.enabled && weatherSeconds > 0) this.stepWeather(weatherSeconds);
    this.modifiers.update(deltaSeconds);
    this.writeSample();
    return this.sample;
  }

  /** Starts over from the last init's start with `seed`, to replay a
   *  sequence. Does nothing before an init. */
  reseed(seed: number): void {
    if (this.start) this.init(this.climate, seed, this.start);
  }

  /** The next `count` states, in order. Picking them fixes them. */
  forecast(count: number): ForecastEntry[] {
    this.fillUpcoming(count);
    const entries: ForecastEntry[] = [];
    let startsIn = Math.max(0, this.stateDuration - this.stateElapsed);
    for (let i = 0; i < count; i++) {
      const next = this.upcoming[i];
      entries.push({ state: next.state, startsIn, duration: next.duration });
      startsIn += next.duration;
    }
    return entries;
  }

  /**
   * For scripted events. Disabled, the weather stops where it is and the
   * script writes the knobs with setKnobs; modifiers still apply. Enabled
   * again, each knob moves from where the script left it back to the
   * weather at its normal rate.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setKnobs(knobs: Partial<WeatherKnobs> & { windBearing?: number }): void {
    for (const id of KNOB_IDS) {
      const value = knobs[id];
      if (value !== undefined) this.base[id] = saturate(value);
    }
    if (knobs.windBearing !== undefined)
      this.bearing = wrapDegrees(knobs.windBearing);
  }

  addModifier(modifier: Omit<AtmosphereModifier, 'weight'>): void {
    this.modifiers.add(modifier);
  }

  setModifierWeight(id: string, weight: number): void {
    this.modifiers.setWeight(id, weight);
  }

  /** Fades out, then removes. */
  removeModifier(id: string): void {
    this.modifiers.remove(id);
  }

  /** Debug: jumps to a state and re-picks the forecast. `snap` skips the ease. */
  forceState(state: WeatherStateId, snap = false): void {
    this.enterState(state, this.pickDuration(state));
    this.upcoming.length = 0;
    this.fillUpcoming(this.forecastLength);
    if (!snap) return;
    this.snapDrivers();
    this.variation.reset(
      WEATHER_STATES[state].variation,
      this.climate.variationScale
    );
    deriveKnobs(
      this.drivers,
      this.climate,
      0,
      0,
      this.cycle.elevation,
      this.raw
    );
    copyKnobs(this.raw, this.base);
    this.prevailing = this.prevailingTarget;
    this.bearing = wrapDegrees(this.prevailing + this.stateBearingOffset);
    this.writeSample();
  }

  private stepWeather(dt: number): void {
    const cycleSeconds = Math.max(1, this.cycle.cycleSeconds);
    this.time += dt;

    this.stateElapsed += dt;
    if (this.stateElapsed >= this.stateDuration) {
      this.fillUpcoming(1);
      const next = this.upcoming.shift()!;
      this.enterState(next.state, next.duration);
    }
    this.fillUpcoming(this.forecastLength);

    const def = WEATHER_STATES[this.state];
    this.nextRetarget -= dt;
    if (this.nextRetarget <= 0) this.retarget(def);

    const rates = this.climate.driverRates;
    const drivers = this.drivers;
    const targets = this.driverTargets;
    const pressureRate = def.pressureRateOverride ?? rates.pressure;
    drivers.pressure += ease(targets.pressure - drivers.pressure, pressureRate / cycleSeconds, dt);
    drivers.moisture += ease(targets.moisture - drivers.moisture, rates.moisture / cycleSeconds, dt);
    drivers.instability += ease(
      targets.instability - drivers.instability,
      rates.instability / cycleSeconds,
      dt
    );

    const perCycle = (Math.abs(drivers.pressure - this.previousPressure) / dt) * cycleSeconds;
    this.previousPressure = drivers.pressure;
    const trend = saturate(perCycle / this.climate.maxPressureTrend);
    this.pressureTrend += ease(trend - this.pressureTrend, TREND_RATE, dt);

    deriveKnobs(
      drivers,
      this.climate,
      this.pressureTrend,
      gustNoise(this.time),
      this.cycle.elevation,
      this.raw
    );
    const knobRates = this.climate.knobRates;
    const base = this.base;
    for (let i = 0; i < KNOB_IDS.length; i++) {
      const id = KNOB_IDS[i];
      base[id] += ease(this.raw[id] - base[id], knobRates[id], dt);
    }
    // Rain needs the cloud it falls from: it never runs ahead of the clouds
    // the sky shows, however fast the drivers turn.
    base.precipitation = Math.min(
      base.precipitation,
      smoothstep(base.cloudiness, 0.6, 0.9)
    );

    this.prevailing += ease(
      angleDelta(this.prevailing, this.prevailingTarget),
      PREVAILING_RATE / cycleSeconds,
      dt
    );
    const bearingRate = def.bearingRateOverride ?? this.climate.bearingRate;
    this.bearing = wrapDegrees(
      this.bearing +
        ease(
          angleDelta(this.bearing, this.prevailing + this.stateBearingOffset),
          bearingRate / cycleSeconds,
          dt
        )
    );

    this.variation.update(def.variation, this.climate.variationScale, dt);
  }

  private writeSample(): void {
    const sample = this.sample;
    copyKnobs(this.base, sample.baseKnobs);
    copyKnobs(this.base, sample);
    if (this.enabled) this.variation.apply(sample);
    this.modifiers.apply(sample);
    const swing = this.enabled ? this.variation.bearing : 0;
    sample.windBearing = wrapDegrees(this.bearing + swing);
    sample.elevation = this.cycle.elevation;
    sample.state = this.state;
    sample.stateProgress = saturate(this.stateElapsed / this.stateDuration);
  }

  private enterState(state: WeatherStateId, duration: number): void {
    const def = WEATHER_STATES[state];
    this.state = state;
    this.stateElapsed = 0;
    this.stateDuration = Math.max(1, duration);
    const wander = this.climate.prevailingWander;
    this.prevailingTarget =
      this.startBearing + this.targetRng.between(-wander, wander);
    this.retarget(def);
    this.variation.enterState(def.variation);
  }

  private retarget(def: WeatherStateDef): void {
    const rng = this.targetRng;
    const targets = this.driverTargets;
    targets.pressure = rng.in(this.pressureRange(def));
    targets.moisture = rng.in(this.moistureRange(def));
    targets.instability = rng.in(this.instabilityRange(def));
    this.stateBearingOffset = rng.in(def.bearingOffset);
    this.nextRetarget =
      rng.in(def.retargetInterval) * Math.max(1, this.cycle.cycleSeconds);
  }

  private snapDrivers(): void {
    this.drivers.pressure = this.driverTargets.pressure;
    this.drivers.moisture = this.driverTargets.moisture;
    this.drivers.instability = this.driverTargets.instability;
    this.previousPressure = this.drivers.pressure;
    this.pressureTrend = 0;
  }

  private pickDuration(state: WeatherStateId): number {
    return (
      this.stateRng.in(WEATHER_STATES[state].duration) *
      Math.max(1, this.cycle.cycleSeconds)
    );
  }

  private fillUpcoming(count: number): void {
    const upcoming = this.upcoming;
    while (upcoming.length < count) {
      let startsIn = Math.max(0, this.stateDuration - this.stateElapsed);
      for (const entry of upcoming) startsIn += entry.duration;
      const from = upcoming.length
        ? upcoming[upcoming.length - 1].state
        : this.state;
      const elevation = this.cycle.paused
        ? this.cycle.elevation
        : this.cycle.elevationAfter(startsIn);
      const state = this.pickNext(from, elevation);
      upcoming.push({ state, duration: this.pickDuration(state) });
    }
  }

  private pickNext(from: WeatherStateId, elevation: number): WeatherStateId {
    const transitions = WEATHER_STATES[from].transitions;
    let total = 0;
    for (const to in transitions)
      total += this.transitionWeight(to as WeatherStateId, transitions, elevation);
    if (total <= 0) return this.climate.fallbackState;

    let roll = this.stateRng.next() * total;
    let last: WeatherStateId = this.climate.fallbackState;
    for (const to in transitions) {
      const weight = this.transitionWeight(to as WeatherStateId, transitions, elevation);
      if (weight <= 0) continue;
      last = to as WeatherStateId;
      roll -= weight;
      if (roll < 0) return last;
    }
    return last;
  }

  private transitionWeight(
    to: WeatherStateId,
    transitions: Partial<Record<WeatherStateId, number>>,
    elevation: number
  ): number {
    return (
      (transitions[to] ?? 0) *
      (this.climate.stateWeights[to] ?? 1) *
      this.timeOfDayModifier(to, elevation)
    );
  }

  private timeOfDayModifier(state: WeatherStateId, elevation: number): number {
    const period = dayPeriod(elevation);
    const weights = WEATHER_STATES[state].timeOfDay;
    let modifier = 1;
    if (weights) {
      if (isDawn(elevation) && weights.dawn !== undefined) modifier = weights.dawn;
      else if (isDusk(elevation) && weights.dusk !== undefined)
        modifier = weights.dusk;
      else modifier = weights[period] ?? 1;
    }
    if (state === 'Storm' && period === 'afternoon')
      modifier *= 1 + this.climate.afternoonStormBias;
    return modifier;
  }

  /** The state whose middle looks most like the authored knobs. */
  private nearestState(start: AtmosphereStart): WeatherStateId {
    const knobs = createKnobs();
    const drivers: Drivers = { pressure: 0, moisture: 0, instability: 0 };
    let best: WeatherStateId = this.climate.initialState;
    let bestDistance = Infinity;
    for (const id of WEATHER_STATE_IDS) {
      if ((this.climate.stateWeights[id] ?? 1) <= 0) continue;
      const def = WEATHER_STATES[id];
      drivers.pressure = middle(this.pressureRange(def));
      drivers.moisture = middle(this.moistureRange(def));
      drivers.instability = middle(this.instabilityRange(def));
      deriveKnobs(drivers, this.climate, 0, 0, start.elevation, knobs);
      const distance =
        (knobs.cloudiness - start.cloudiness) ** 2 +
        2 * (knobs.precipitation - start.precipitation) ** 2 +
        (knobs.fog - start.fog) ** 2 +
        0.5 * (knobs.windiness - start.windiness) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  private pressureRange(def: WeatherStateDef): WeatherRange {
    const offset = this.climate.pressureOffset;
    return {
      min: saturate(def.pressure.min + offset),
      max: saturate(def.pressure.max + offset),
    };
  }

  private moistureRange(def: WeatherStateDef): WeatherRange {
    const scale = this.climate.moistureScale;
    return {
      min: saturate(def.moisture.min * scale),
      max: saturate(def.moisture.max * scale),
    };
  }

  private instabilityRange(def: WeatherStateDef): WeatherRange {
    const scale = this.climate.instabilityScale;
    return {
      min: saturate(def.instability.min * scale),
      max: saturate(def.instability.max * scale),
    };
  }
}

function ease(diff: number, rate: number, dt: number): number {
  return diff * (1 - Math.exp(-rate * dt));
}

/** Signed shortest turn from `from` to `to`, in degrees. */
function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function middle(range: WeatherRange): number {
  return (range.min + range.max) / 2;
}

function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
