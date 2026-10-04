export interface WeatherRange {
  min: number;
  max: number;
}

export type WeatherStateId =
  | 'Clear'
  | 'Fair'
  | 'Overcast'
  | 'Mist'
  | 'FrontApproaching'
  | 'Rain'
  | 'Storm'
  | 'Clearing';

export interface Drivers {
  /** 0 low and unsettled, 1 high and fair. */
  pressure: number;
  /** 0 dry, 1 saturated. */
  moisture: number;
  /** 0 calm, 1 air that forms thunderstorms. */
  instability: number;
}

export interface WeatherKnobs {
  cloudiness: number;
  windiness: number;
  precipitation: number;
  fog: number;
  temperature: number;
}

export type KnobId = keyof WeatherKnobs;

export const KNOB_IDS: readonly KnobId[] = [
  'cloudiness',
  'windiness',
  'precipitation',
  'fog',
  'temperature',
];

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/** Multipliers on the chance of entering a state at a time of day. `dawn` and
 *  `dusk` replace the period's value near the horizon. Missing = 1. */
export interface TimeOfDayWeights {
  morning?: number;
  afternoon?: number;
  evening?: number;
  night?: number;
  dawn?: number;
  dusk?: number;
}

/** A short swing of the wind inside a state: the bearing turns and the wind
 *  and rain rise, then settle back. One at a time; each value is picked per
 *  burst from its range and scaled by the climate's variationScale. */
export interface WeatherBurst {
  /** Seconds from the end of one burst to the start of the next. The first
   *  comes this long after the state starts. */
  every: WeatherRange;
  /** Seconds a burst lasts: it builds over the first 30%, holds, and eases
   *  out over the last 40%. */
  duration: WeatherRange;
  /** Degrees the wind swings at the burst's height, to a random side. */
  bearing: WeatherRange;
  /** Added to windiness at the burst's height. */
  windiness: WeatherRange;
  /** Added to precipitation at the burst's height, only where rain already
   *  falls. 0 for a dry gust. */
  precipitation: WeatherRange;
}

/** How a state moves while it holds, on top of the weather the drivers give.
 *  Added after the knobs are smoothed, so it acts in seconds. A new state's
 *  amounts fade in over about ten seconds. */
export interface WeatherVariationDef {
  /** The most each knob strays either way from the weather, and `bearing` in
   *  degrees. Each strays on its own smooth curve. Missing = still. Rain
   *  strays only where it falls, so a dry sky stays dry. */
  wander: Partial<Record<KnobId | 'bearing', number>>;
  /** Seconds each curve takes to move from one random offset to the next.
   *  Short is restless, long is slow and swelling. */
  wanderPeriod: WeatherRange;
  /** Short swings of the wind and rain. Omit for a state with none. */
  burst?: WeatherBurst;
}

/**
 * One named weather state. The three driver ranges decide what the state looks
 * like; the knobs are derived from the drivers (WeatherDerivation), never set
 * directly. A rate "per cycle" of r eases with a time constant of
 * cycleSeconds / r: 10 in a 300 s cycle is 30 s.
 */
export interface WeatherStateDef {
  /** Must match the state's key in WEATHER_STATES. */
  id: WeatherStateId;
  /** 0..1. Low pressure brings cloud and wind; high is settled and clear.
   *  Cloud follows moisture × (1 − pressure). */
  pressure: WeatherRange;
  /** 0..1. Wet air: cloud, then rain above about 0.6, and mist above 0.75
   *  where the wind is light. Scaled by the climate's moistureScale. */
  moisture: WeatherRange;
  /** 0..1. Convection: strengthens rain and wind under low pressure.
   *  Lightning needs it high, through the cloud and rain it raises. */
  instability: WeatherRange;
  /** How long the state holds, in fractions of one day cycle, picked once on
   *  entry. 0.4 in a 300 s cycle is 2 minutes. */
  duration: WeatherRange;
  /** Fractions of one day cycle between new driver targets inside the three
   *  ranges, so a long state drifts instead of holding one look. */
  retargetInterval: WeatherRange;
  /** Per cycle; replaces the climate's pressure rate. Wind rises with how fast
   *  pressure changes, so a fast rate here is what makes a front windy. */
  pressureRateOverride?: number;
  /** Degrees the wind turns from the prevailing bearing while the state holds,
   *  picked on entry and on each retarget. Negative backs the wind, positive
   *  veers it. */
  bearingOffset: WeatherRange;
  /** Per cycle; replaces the climate's bearingRate. How fast the wind turns
   *  to this state's bearing. */
  bearingRateOverride?: number;
  /** Relative chances of each next state. They need not sum to 1; the
   *  climate's stateWeights and timeOfDay multiply them first. A state left
   *  out can never follow this one. */
  transitions: Partial<Record<WeatherStateId, number>>;
  /** Multipliers on the chance of entering this state, by the time of day
   *  it would start. */
  timeOfDay?: TimeOfDayWeights;
  /** Wander and short bursts while the state holds, in seconds. */
  variation: WeatherVariationDef;
}

export type WeatherClimateId =
  | 'arid'
  | 'temperate'
  | 'tropical'
  | 'coastal'
  | 'tundra';

export interface ClimateProfile {
  id: WeatherClimateId;
  label: string;
  fallbackState: WeatherStateId;
  initialState: WeatherStateId;

  moistureScale: number;
  pressureOffset: number;
  instabilityScale: number;

  /** Multipliers on the chance of entering each state. Missing = 1. */
  stateWeights: Partial<Record<WeatherStateId, number>>;
  afternoonStormBias: number;

  baseTemperature: number;
  diurnalSwing: number;
  baseWind: number;
  mistFactor: number;
  dustFactor: number;
  /** Pressure change per cycle that gives the most wind. */
  maxPressureTrend: number;

  /** Degrees the prevailing wind strays either side of where it started. */
  prevailingWander: number;
  /** Per cycle. How fast the wind turns between states. */
  bearingRate: number;
  /** Scale on every state's in-state variation. */
  variationScale: number;

  /** Per cycle. */
  driverRates: Drivers;
  /** Per second. */
  knobRates: WeatherKnobs;
}

export interface ForecastEntry {
  state: WeatherStateId;
  /** Seconds from now. */
  startsIn: number;
  /** Seconds. */
  duration: number;
}

export interface WeatherSample extends WeatherKnobs {
  state: WeatherStateId;
  /** 0..1 through the current state. */
  stateProgress: number;
  /** Degrees the air moves toward: 0 = +x, 90 = +z. */
  windBearing: number;
  /** Sun elevation in degrees, unwrapped. */
  elevation: number;
  /** The knobs before variation and modifiers. */
  baseKnobs: WeatherKnobs;
}

export type ModifierOp = 'set' | 'add' | 'multiply' | 'min' | 'max';

export interface ModifierEffect {
  knob: KnobId;
  op: ModifierOp;
  value: number;
}

export interface AtmosphereModifier {
  id: string;
  effects: ModifierEffect[];
  /** Higher applies later, so it wins. */
  priority: number;
  /** Seconds from weight 0 to 1. 0 = immediate. */
  fadeIn: number;
  /** Seconds from weight 1 to 0. 0 = immediate. */
  fadeOut: number;
  /** 0..1, set by gameplay. */
  targetWeight: number;
  /** 0..1, eased toward targetWeight by the system. */
  weight: number;
}

/** Where the atmosphere starts: the authored sky. */
export interface AtmosphereStart extends WeatherKnobs {
  elevation: number;
  windBearing: number;
  /** Omitted picks the state nearest the authored knobs. */
  state?: WeatherStateId;
}

export function createKnobs(): WeatherKnobs {
  return {
    cloudiness: 0,
    windiness: 0,
    precipitation: 0,
    fog: 0,
    temperature: 0.5,
  };
}

export function copyKnobs(from: WeatherKnobs, to: WeatherKnobs): void {
  to.cloudiness = from.cloudiness;
  to.windiness = from.windiness;
  to.precipitation = from.precipitation;
  to.fog = from.fog;
  to.temperature = from.temperature;
}
