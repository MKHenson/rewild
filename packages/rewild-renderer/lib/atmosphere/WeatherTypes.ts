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

/** A short swing of the wind inside a state: the bearing turns by `bearing`
 *  degrees either way and the wind and rain rise, then settle back. Times in
 *  seconds. */
export interface WeatherBurst {
  every: WeatherRange;
  duration: WeatherRange;
  bearing: WeatherRange;
  windiness: WeatherRange;
  precipitation: WeatherRange;
}

/** How a state moves while it holds. `wander` is the most each output strays
 *  from the weather, `bearing` in degrees; each strays on its own slow curve
 *  that turns every `wanderPeriod` seconds. */
export interface WeatherVariationDef {
  wander: Partial<Record<KnobId | 'bearing', number>>;
  wanderPeriod: WeatherRange;
  burst?: WeatherBurst;
}

export interface WeatherStateDef {
  id: WeatherStateId;
  pressure: WeatherRange;
  moisture: WeatherRange;
  instability: WeatherRange;
  /** Fractions of one day cycle. */
  duration: WeatherRange;
  /** Fractions of one day cycle between new driver targets inside the ranges. */
  retargetInterval: WeatherRange;
  /** Per cycle. Fast for the fronts, which is what raises their wind. */
  pressureRateOverride?: number;
  /** Degrees the wind turns from the prevailing bearing while the state holds. */
  bearingOffset: WeatherRange;
  /** Per cycle. How fast the wind turns to this state's bearing. */
  bearingRateOverride?: number;
  transitions: Partial<Record<WeatherStateId, number>>;
  timeOfDay?: TimeOfDayWeights;
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
