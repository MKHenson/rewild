import { smoothstep } from 'rewild-common';
import { sunHeight } from './DayNightCycle';
import { ClimateProfile, Drivers, WeatherKnobs } from './WeatherTypes';

/** Cloudiness in steady rain, and the most a storm reaches. */
const RAIN_CLOUDINESS = 0.85;
const STORM_CLOUDINESS = 0.95;

function saturate(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The raw knobs for a set of drivers. `pressureTrend` is 0..1, how fast the
 * pressure is changing against the climate's most; `gust` is -1..1. Temperature
 * comes before fog, which reads it for snow.
 */
export function deriveKnobs(
  drivers: Drivers,
  climate: ClimateProfile,
  pressureTrend: number,
  gust: number,
  elevation: number,
  out: WeatherKnobs
): WeatherKnobs {
  const { pressure, moisture, instability } = drivers;

  // Fills to RAIN_CLOUDINESS as the air turns wet and unsettled; unstable air
  // towers into storm cloud up to STORM_CLOUDINESS. A full 1 shuts out the sun
  // and leaves the scene too dark to play in.
  const humid = moisture * (1 - pressure);
  const cloudiness =
    RAIN_CLOUDINESS * smoothstep(humid, 0.05, 0.45) +
    (STORM_CLOUDINESS - RAIN_CLOUDINESS) *
      smoothstep(instability, 0.5, 0.85) *
      smoothstep(humid, 0.3, 0.6);

  const precipitation =
    smoothstep(cloudiness, 0.6, 0.9) *
    smoothstep(moisture, 0.6, 0.9) *
    (0.6 + 0.4 * instability);

  const windiness = saturate(
    climate.baseWind +
      0.6 * pressureTrend +
      instability * (1 - pressure) +
      gust * 0.1
  );

  const temperature = saturate(
    climate.baseTemperature +
      climate.diurnalSwing *
        0.5 *
        sunHeight(elevation) *
        (1 - 0.6 * cloudiness) -
      0.15 * precipitation
  );

  const snowFraction = saturate((0.5 - temperature) / 0.5);
  const calm = 1 - windiness;
  const mist =
    smoothstep(moisture, 0.75, 0.95) * calm * calm * climate.mistFactor;
  const precHaze = saturate(
    0.35 * Math.pow(precipitation, 1.5) * (1 + 0.3 * snowFraction)
  );
  const cloudDim = 0.3 * smoothstep(cloudiness, 0.8, 1);
  const dust = saturate(windiness * (1 - moisture) * climate.dustFactor);
  const fog =
    1 - (1 - saturate(mist)) * (1 - precHaze) * (1 - cloudDim) * (1 - dust);

  out.cloudiness = cloudiness;
  out.precipitation = precipitation;
  out.windiness = windiness;
  out.temperature = temperature;
  out.fog = fog;
  return out;
}

/** -1..1, a smooth gusting the wind rides on. */
export function gustNoise(seconds: number): number {
  return (
    0.5 * Math.sin(seconds * 0.9) +
    0.3 * Math.sin(seconds * 2.3 + 1.7) +
    0.2 * Math.sin(seconds * 5.1 + 4.2)
  );
}
