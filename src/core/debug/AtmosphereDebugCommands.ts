import {
  isWeatherClimateId,
  isWeatherStateId,
  Renderer,
  resolveWeatherClimate,
  WEATHER_CLIMATES,
  WEATHER_STATE_IDS,
} from 'rewild-renderer';

// The day/night cycle and the weather (AtmosphereSystem). They act only while
// the sky's Dynamic Day & Weather switch is on.
export function registerAtmosphereDebugCommands(renderer: Renderer) {
  const atmosphere = () => renderer.sky.atmosphere;

  const warnIfStopped = () => {
    if (!atmosphere().running)
      console.warn(
        'The atmosphere is not running: turn on Dynamic Day & Weather on the Sky.'
      );
  };

  (window as any).weather = () => {
    const system = atmosphere();
    warnIfStopped();
    const sample = system.sample;
    const round = (x: number) => Math.round(x * 100) / 100;
    console.log(
      `${sample.state} ${Math.round(sample.stateProgress * 100)}% through, ` +
        `climate ${system.climate.id}, seed ${system.seed}` +
        (system.isEnabled ? '' : ' (disabled by a script)')
    );
    console.table({
      output: {
        cloudiness: round(sample.cloudiness),
        windiness: round(sample.windiness),
        precipitation: round(sample.precipitation),
        fog: round(sample.fog),
        temperature: round(sample.temperature),
      },
      weather: {
        cloudiness: round(sample.baseKnobs.cloudiness),
        windiness: round(sample.baseKnobs.windiness),
        precipitation: round(sample.baseKnobs.precipitation),
        fog: round(sample.baseKnobs.fog),
        temperature: round(sample.baseKnobs.temperature),
      },
    });
    console.log(
      `Drivers: pressure ${round(system.drivers.pressure)}, moisture ${round(
        system.drivers.moisture
      )}, instability ${round(system.drivers.instability)}, pressure trend ${round(
        system.pressureTrend
      )}\nWind bearing ${Math.round(sample.windBearing)}° (weather ${Math.round(
        system.bearing
      )}°), sun elevation ${Math.round(sample.elevation % 360)}°`
    );
    console.table(
      system.forecast(system.forecastLength).map((entry) => ({
        state: entry.state,
        'starts in (s)': Math.round(entry.startsIn),
        'lasts (s)': Math.round(entry.duration),
      }))
    );
  };

  (window as any).setWeather = (state?: string, snap = false) => {
    if (!isWeatherStateId(state)) {
      console.log(
        `setWeather(state, snap = false) — jumps to a state and re-picks the forecast; snap skips the ease. States: ${WEATHER_STATE_IDS.join(
          ', '
        )}.`
      );
      return;
    }
    warnIfStopped();
    atmosphere().forceState(state, snap);
    console.log(`setWeather('${state}'${snap ? ', true' : ''})`);
  };

  (window as any).setDayCycle = (override: Record<string, unknown> = {}) => {
    const system = atmosphere();
    const cycle = system.cycle;
    if (typeof override.cycleSeconds === 'number')
      cycle.cycleSeconds = override.cycleSeconds;
    if (typeof override.dayShare === 'number') cycle.dayShare = override.dayShare;
    if (typeof override.paused === 'boolean') cycle.paused = override.paused;
    if (typeof override.timeScale === 'number')
      cycle.timeScale = override.timeScale;
    if (typeof override.weatherPausesWithCycle === 'boolean')
      system.weatherPausesWithCycle = override.weatherPausesWithCycle;
    warnIfStopped();
    console.log(
      'setDayCycle — the cycle is now',
      {
        cycleSeconds: cycle.cycleSeconds,
        dayShare: cycle.dayShare,
        paused: cycle.paused,
        timeScale: cycle.timeScale,
        weatherPausesWithCycle: system.weatherPausesWithCycle,
      },
      '\nKeys: cycleSeconds, one day and night (weather durations scale with it); dayShare, the part of it the sun is up; paused; timeScale, scale on the sun only; weatherPausesWithCycle.'
    );
  };

  (window as any).setTimeOfDay = (elevation?: number) => {
    if (typeof elevation !== 'number') {
      console.log(
        'setTimeOfDay(elevation) — sun elevation in degrees: 0 sunrise, 90 noon, 180 sunset, 270 midnight.'
      );
      return;
    }
    warnIfStopped();
    atmosphere().cycle.elevation = elevation;
  };

  (window as any).setWeatherClimate = (id?: string) => {
    if (!isWeatherClimateId(id)) {
      console.log(
        `setWeatherClimate(id) — the weather profile until the next load. Profiles: ${Object.keys(
          WEATHER_CLIMATES
        ).join(', ')}.`
      );
      return;
    }
    warnIfStopped();
    atmosphere().climate = resolveWeatherClimate(id);
  };

  (window as any).setWeatherVariation = (scale = 1) => {
    const system = atmosphere();
    system.climate = { ...system.climate, variationScale: scale };
    console.log(
      `setWeatherVariation(${scale}) — scale on the wander and the bursts inside each state, 1 the default, 0 off. New bursts take it.`
    );
  };
}
