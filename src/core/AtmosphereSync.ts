import { PropValue } from 'models';
import {
  isWeatherStateId,
  Renderer,
  resolveClimatePreset,
  resolveWeatherClimate,
} from 'rewild-renderer';

export type AtmosphereProps = Partial<Record<string, PropValue>>;

/** Rolled once per load, so editing other settings keeps the same moon. */
const randomMoonPhase = Math.random();

/**
 * Sets the sky to the authored atmosphere. With the day/night switch on, the
 * atmosphere system starts from those values and runs the cycle and the
 * weather. The world's climate preset picks the weather profile; the seed is
 * random, so each start plays out differently. `setWeatherSeed` replays one.
 * Set the terrain's preset first.
 */
export function applyAtmosphere(renderer: Renderer, atmosphere: AtmosphereProps) {
  const sky = renderer.sky.skyRenderer;
  sky.cloudiness = atmosphere.cloudiness as f32;
  sky.foginess = atmosphere.foginess as f32;
  sky.windiness = atmosphere.windiness as f32;
  sky.windBearing = (atmosphere.windDirection ?? 180) as f32;
  sky.precipitation = atmosphere.precipitation as f32;
  sky.temperature = atmosphere.temperature as f32;
  sky.elevation = atmosphere.elevation as f32;
  sky.moon.phase = atmosphere.randomMoonPhase
    ? randomMoonPhase
    : ((atmosphere.moonPhase ?? 0.5) as f32);

  const system = renderer.sky.atmosphere;
  if (!atmosphere.dayNightCycle) {
    system.running = false;
    return;
  }

  const terrain = renderer.terrainRenderer;
  const climate = resolveWeatherClimate(
    resolveClimatePreset(terrain.climatePreset).weather
  );
  const seed = Math.floor(Math.random() * 0x100000000);
  system.init(climate, seed, {
    elevation: sky.elevation,
    windBearing: sky.windBearing,
    cloudiness: sky.cloudiness,
    windiness: sky.windiness,
    precipitation: sky.precipitation,
    fog: sky.foginess,
    temperature: sky.temperature,
    state: isWeatherStateId(atmosphere.weatherState)
      ? atmosphere.weatherState
      : undefined,
  });
}
