import { WEATHER_STATE_IDS, randomWeatherState } from './WeatherStates';
import { ClimateProfile, WeatherStateId } from './WeatherTypes';

function climate(
  stateWeights: ClimateProfile['stateWeights'],
  initialState: WeatherStateId = WEATHER_STATE_IDS[0]
): ClimateProfile {
  return { stateWeights, initialState } as ClimateProfile;
}

/** Every weight zero, then the given ones. */
function only(weights: ClimateProfile['stateWeights']) {
  const all: ClimateProfile['stateWeights'] = {};
  for (const id of WEATHER_STATE_IDS) all[id] = 0;
  return { ...all, ...weights };
}

describe('randomWeatherState', () => {
  const [a, b, c] = WEATHER_STATE_IDS;

  it('never picks a state the climate never has', () => {
    const profile = climate(only({ [b]: 1 }));
    for (let r = 0; r < 1; r += 0.05)
      expect(randomWeatherState(profile, () => r)).toBe(b);
  });

  it('picks states in proportion to their weights', () => {
    const profile = climate(only({ [a]: 1, [b]: 3 }));
    expect(randomWeatherState(profile, () => 0.2)).toBe(a);
    expect(randomWeatherState(profile, () => 0.3)).toBe(b);
    expect(randomWeatherState(profile, () => 0.99)).toBe(b);
  });

  it('counts a missing weight as 1', () => {
    const profile = climate({});
    const picks = new Set<WeatherStateId>();
    for (let i = 0; i < WEATHER_STATE_IDS.length; i++)
      picks.add(
        randomWeatherState(profile, () => (i + 0.5) / WEATHER_STATE_IDS.length)
      );
    expect(picks.size).toBe(WEATHER_STATE_IDS.length);
  });

  it('falls back to the initial state when every weight is zero', () => {
    expect(randomWeatherState(climate(only({}), c), () => 0.5)).toBe(c);
  });
});
