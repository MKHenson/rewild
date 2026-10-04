import { ClimateProfile, WeatherClimateId } from './WeatherTypes';

const DRIVER_RATES = { pressure: 7.5, moisture: 6, instability: 9 };
const KNOB_RATES = {
  windiness: 0.5,
  cloudiness: 0.025,
  precipitation: 0.04,
  fog: 0.03,
  temperature: 0.02,
};

const SHARED = {
  fallbackState: 'Fair',
  initialState: 'Fair',
  pressureOffset: 0,
  instabilityScale: 1,
  maxPressureTrend: 3,
  prevailingWander: 40,
  bearingRate: 2.5,
  variationScale: 1,
  driverRates: DRIVER_RATES,
  knobRates: KNOB_RATES,
} as const;

export const DEFAULT_WEATHER_CLIMATE: WeatherClimateId = 'temperate';

// Game content: one profile per world, chosen by its terrain climate preset
// (ClimateConfig.weather).
export const WEATHER_CLIMATES: Record<WeatherClimateId, ClimateProfile> = {
  arid: {
    ...SHARED,
    id: 'arid',
    label: 'Arid',
    initialState: 'Clear',
    fallbackState: 'Clear',
    moistureScale: 0.4,
    stateWeights: { Clear: 2, Fair: 1.5, Rain: 0.05, Mist: 0, Storm: 0.3 },
    afternoonStormBias: 0,
    baseTemperature: 0.8,
    diurnalSwing: 0.4,
    baseWind: 0.2,
    mistFactor: 0,
    dustFactor: 0.8,
  },
  temperate: {
    ...SHARED,
    id: 'temperate',
    label: 'Temperate',
    moistureScale: 1,
    stateWeights: {},
    afternoonStormBias: 0.3,
    baseTemperature: 0.5,
    diurnalSwing: 0.2,
    baseWind: 0.15,
    mistFactor: 0.7,
    dustFactor: 0,
  },
  tropical: {
    ...SHARED,
    id: 'tropical',
    label: 'Tropical',
    moistureScale: 1.1,
    stateWeights: { Fair: 1.5, Storm: 1.5, Clear: 0.6, Mist: 0.5 },
    afternoonStormBias: 2,
    baseTemperature: 0.85,
    diurnalSwing: 0.1,
    baseWind: 0.1,
    mistFactor: 0.5,
    dustFactor: 0,
  },
  coastal: {
    ...SHARED,
    id: 'coastal',
    label: 'Coastal',
    initialState: 'Overcast',
    moistureScale: 1.1,
    stateWeights: { Mist: 1.8, Rain: 1.5, Overcast: 1.5, Clear: 0.6 },
    afternoonStormBias: 0,
    baseTemperature: 0.5,
    diurnalSwing: 0.1,
    baseWind: 0.25,
    mistFactor: 1,
    dustFactor: 0,
  },
  tundra: {
    ...SHARED,
    id: 'tundra',
    label: 'Tundra',
    initialState: 'Overcast',
    fallbackState: 'Overcast',
    moistureScale: 0.7,
    stateWeights: { Overcast: 1.8, Clear: 1.5, Storm: 0.4, Mist: 0.6 },
    afternoonStormBias: 0,
    baseTemperature: 0.1,
    diurnalSwing: 0.1,
    baseWind: 0.25,
    mistFactor: 0.4,
    dustFactor: 0.1,
  },
};

/** Omitted ⇒ temperate. */
export function resolveWeatherClimate(
  id: WeatherClimateId | undefined
): ClimateProfile {
  return WEATHER_CLIMATES[id ?? DEFAULT_WEATHER_CLIMATE];
}

export function isWeatherClimateId(id: unknown): id is WeatherClimateId {
  return typeof id === 'string' && id in WEATHER_CLIMATES;
}
