import { WeatherStateDef, WeatherStateId } from './WeatherTypes';

// Game content: tune in play. Durations and retarget intervals are fractions
// of one day cycle; variation periods and bursts are seconds.
export const WEATHER_STATES: Record<WeatherStateId, WeatherStateDef> = {
  Clear: {
    id: 'Clear',
    pressure: { min: 0.75, max: 1 },
    moisture: { min: 0, max: 0.3 },
    instability: { min: 0, max: 0.2 },
    duration: { min: 0.1, max: 0.3 },
    retargetInterval: { min: 0.03, max: 0.08 },
    bearingOffset: { min: -25, max: 25 },
    transitions: { Fair: 0.6, Mist: 0.2, FrontApproaching: 0.2 },
    variation: {
      wander: { cloudiness: 0.06, windiness: 0.1, bearing: 20 },
      wanderPeriod: { min: 10, max: 30 },
      burst: {
        every: { min: 40, max: 90 },
        duration: { min: 3, max: 7 },
        bearing: { min: 10, max: 25 },
        windiness: { min: 0.05, max: 0.12 },
        precipitation: { min: 0, max: 0 },
      },
    },
  },
  Fair: {
    id: 'Fair',
    pressure: { min: 0.55, max: 0.8 },
    moisture: { min: 0.3, max: 0.55 },
    instability: { min: 0, max: 0.3 },
    duration: { min: 0.1, max: 0.3 },
    retargetInterval: { min: 0.03, max: 0.08 },
    bearingOffset: { min: -25, max: 25 },
    transitions: { Clear: 0.35, Overcast: 0.4, FrontApproaching: 0.25 },
    variation: {
      wander: { cloudiness: 0.08, windiness: 0.1, bearing: 20 },
      wanderPeriod: { min: 10, max: 30 },
      burst: {
        every: { min: 30, max: 80 },
        duration: { min: 3, max: 8 },
        bearing: { min: 10, max: 25 },
        windiness: { min: 0.06, max: 0.14 },
        precipitation: { min: 0, max: 0 },
      },
    },
  },
  Overcast: {
    id: 'Overcast',
    pressure: { min: 0.35, max: 0.55 },
    moisture: { min: 0.55, max: 0.8 },
    instability: { min: 0, max: 0.3 },
    duration: { min: 0.08, max: 0.2 },
    retargetInterval: { min: 0.025, max: 0.06 },
    bearingOffset: { min: -30, max: 20 },
    transitions: { Fair: 0.3, Rain: 0.45, FrontApproaching: 0.25 },
    variation: {
      wander: { cloudiness: 0.05, windiness: 0.08, fog: 0.05, bearing: 15 },
      wanderPeriod: { min: 15, max: 40 },
      burst: {
        every: { min: 60, max: 120 },
        duration: { min: 4, max: 9 },
        bearing: { min: 15, max: 30 },
        windiness: { min: 0.05, max: 0.12 },
        precipitation: { min: 0, max: 0 },
      },
    },
  },
  Mist: {
    id: 'Mist',
    pressure: { min: 0.6, max: 0.85 },
    moisture: { min: 0.85, max: 1 },
    instability: { min: 0, max: 0.1 },
    duration: { min: 0.05, max: 0.12 },
    retargetInterval: { min: 0.02, max: 0.05 },
    bearingOffset: { min: -40, max: 40 },
    transitions: { Clear: 0.5, Fair: 0.4, Overcast: 0.1 },
    timeOfDay: { dawn: 3, morning: 0.2, afternoon: 0.2 },
    variation: {
      wander: { fog: 0.12, windiness: 0.04, bearing: 30 },
      wanderPeriod: { min: 15, max: 45 },
    },
  },
  FrontApproaching: {
    id: 'FrontApproaching',
    pressure: { min: 0.1, max: 0.2 },
    moisture: { min: 0.6, max: 0.8 },
    instability: { min: 0.3, max: 0.6 },
    duration: { min: 0.025, max: 0.075 },
    retargetInterval: { min: 0.01, max: 0.02 },
    pressureRateOverride: 48,
    bearingOffset: { min: -60, max: -20 },
    bearingRateOverride: 44,
    transitions: { Rain: 0.6, Storm: 0.4 },
    variation: {
      wander: { cloudiness: 0.05, windiness: 0.1, bearing: 18 },
      wanderPeriod: { min: 6, max: 15 },
      burst: {
        every: { min: 20, max: 45 },
        duration: { min: 4, max: 10 },
        bearing: { min: 20, max: 45 },
        windiness: { min: 0.08, max: 0.18 },
        precipitation: { min: 0, max: 0 },
      },
    },
  },
  Rain: {
    id: 'Rain',
    pressure: { min: 0.2, max: 0.4 },
    moisture: { min: 0.75, max: 0.95 },
    instability: { min: 0.1, max: 0.4 },
    duration: { min: 0.06, max: 0.18 },
    retargetInterval: { min: 0.02, max: 0.05 },
    bearingOffset: { min: -30, max: 10 },
    transitions: { Overcast: 0.4, Storm: 0.2, Clearing: 0.4 },
    variation: {
      wander: { precipitation: 0.18, windiness: 0.08, fog: 0.05, bearing: 15 },
      wanderPeriod: { min: 8, max: 25 },
      burst: {
        every: { min: 40, max: 100 },
        duration: { min: 5, max: 12 },
        bearing: { min: 15, max: 35 },
        windiness: { min: 0.05, max: 0.12 },
        precipitation: { min: 0.1, max: 0.2 },
      },
    },
  },
  Storm: {
    id: 'Storm',
    pressure: { min: 0, max: 0.2 },
    moisture: { min: 0.85, max: 1 },
    instability: { min: 0.85, max: 1 },
    duration: { min: 0.05, max: 0.12 },
    retargetInterval: { min: 0.01, max: 0.03 },
    bearingOffset: { min: -10, max: 30 },
    transitions: { Rain: 0.4, Clearing: 0.6 },
    variation: {
      wander: { precipitation: 0.12, windiness: 0.05, fog: 0.05, bearing: 15 },
      wanderPeriod: { min: 5, max: 15 },
      burst: {
        every: { min: 15, max: 45 },
        duration: { min: 5, max: 14 },
        bearing: { min: 35, max: 80 },
        windiness: { min: 0.1, max: 0.25 },
        precipitation: { min: 0.05, max: 0.15 },
      },
    },
  },
  Clearing: {
    id: 'Clearing',
    pressure: { min: 0.5, max: 0.7 },
    moisture: { min: 0.4, max: 0.6 },
    instability: { min: 0, max: 0.2 },
    duration: { min: 0.0875, max: 0.15 },
    retargetInterval: { min: 0.01, max: 0.02 },
    pressureRateOverride: 48,
    bearingOffset: { min: 40, max: 90 },
    bearingRateOverride: 44,
    transitions: { Fair: 0.6, Clear: 0.3, Mist: 0.1 },
    variation: {
      wander: { cloudiness: 0.06, windiness: 0.1, bearing: 18 },
      wanderPeriod: { min: 6, max: 15 },
      burst: {
        every: { min: 25, max: 60 },
        duration: { min: 4, max: 9 },
        bearing: { min: 20, max: 40 },
        windiness: { min: 0.05, max: 0.15 },
        precipitation: { min: 0, max: 0 },
      },
    },
  },
};

export const WEATHER_STATE_IDS = Object.keys(
  WEATHER_STATES
) as WeatherStateId[];

export function isWeatherStateId(id: unknown): id is WeatherStateId {
  return typeof id === 'string' && id in WEATHER_STATES;
}
