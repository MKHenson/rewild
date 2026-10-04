import { AtmosphereSystem } from './AtmosphereSystem';
import { resolveWeatherClimate } from './ClimateProfiles';
import {
  AtmosphereStart,
  WeatherClimateId,
  WeatherStateId,
} from './WeatherTypes';

const FAIR_START: AtmosphereStart = {
  elevation: 80,
  windBearing: 180,
  cloudiness: 0.3,
  windiness: 0.2,
  precipitation: 0,
  fog: 0.1,
  temperature: 0.5,
};

function system(
  seed = 7,
  climate: WeatherClimateId = 'temperate',
  start = FAIR_START
) {
  const atmosphere = new AtmosphereSystem();
  atmosphere.cycle.cycleSeconds = 150;
  atmosphere.init(resolveWeatherClimate(climate), seed, start);
  return atmosphere;
}

/** Runs `seconds` at 10 Hz, calling `each` after every step. */
function run(
  atmosphere: AtmosphereSystem,
  seconds: number,
  each?: () => void
) {
  for (let t = 0; t < seconds; t += 0.1) {
    atmosphere.update(0.1);
    each?.();
  }
}

function bearingSwing(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

describe('AtmosphereSystem', () => {
  it('gives the same weather for the same seed', () => {
    const a = system(42);
    const b = system(42);
    expect(a.forecast(5)).toEqual(b.forecast(5));
    run(a, 1200);
    run(b, 1200);
    expect(a.state).toBe(b.state);
    expect(a.sample.cloudiness).toBeCloseTo(b.sample.cloudiness, 6);
    expect(a.sample.windBearing).toBeCloseTo(b.sample.windBearing, 6);
  });

  it('keeps its forecast: the states it picks are the states that come', () => {
    const atmosphere = system(3);
    const forecast = atmosphere.forecast(3).map((entry) => entry.state);
    const seen: WeatherStateId[] = [];
    let last = atmosphere.state;
    run(atmosphere, 3 * 600, () => {
      if (atmosphere.state !== last) {
        last = atmosphere.state;
        seen.push(last);
      }
    });
    expect(seen.slice(0, 3)).toEqual(forecast);
  });

  it('builds up to every storm', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const atmosphere = system(seed);
      let previous = atmosphere.state;
      run(atmosphere, 20 * 600, () => {
        if (atmosphere.state === previous) return;
        if (atmosphere.state === 'Storm')
          expect(['FrontApproaching', 'Rain']).toContain(previous);
        previous = atmosphere.state;
      });
    }
  });

  it('raises the wind as a front comes in, before the rain', () => {
    const atmosphere = system();
    atmosphere.forceState('Fair', true);
    run(atmosphere, 30);
    const calm = atmosphere.sample.baseKnobs.windiness;
    atmosphere.forceState('FrontApproaching');
    let windAtFirstRain = -1;
    let peak = 0;
    run(atmosphere, 60, () => {
      peak = Math.max(peak, atmosphere.base.windiness);
      if (windAtFirstRain < 0 && atmosphere.base.precipitation > 0.05)
        windAtFirstRain = atmosphere.base.windiness;
    });
    expect(peak).toBeGreaterThan(calm + 0.15);
    if (windAtFirstRain >= 0)
      expect(windAtFirstRain).toBeGreaterThan(calm + 0.1);
  });

  it('blows a storm at 0.8 to 1', () => {
    const atmosphere = system(31);
    atmosphere.cycle.cycleSeconds = 2400;
    atmosphere.forceState('Storm', true);
    const wind: number[] = [];
    run(atmosphere, 300, () => wind.push(atmosphere.sample.windiness));
    wind.sort((a, b) => a - b);
    expect(wind[Math.floor(wind.length * 0.05)]).toBeGreaterThan(0.75);
    expect(wind[Math.floor(wind.length * 0.5)]).toBeGreaterThan(0.85);
  });

  it('never mists in an arid world', () => {
    const atmosphere = system(11, 'arid');
    run(atmosphere, 20 * 600, () => {
      expect(atmosphere.state).not.toBe('Mist');
    });
  });

  it('starts in the state nearest the authored sky', () => {
    expect(
      system(1, 'temperate', {
        ...FAIR_START,
        cloudiness: 0,
        fog: 0,
        windiness: 0.1,
      }).state
    ).toBe('Clear');
    expect(
      ['Rain', 'Storm']
    ).toContain(
      system(1, 'temperate', {
        ...FAIR_START,
        cloudiness: 1,
        precipitation: 0.8,
        fog: 0.6,
      }).state
    );
    expect(system(1, 'temperate', { ...FAIR_START, state: 'Mist' }).state).toBe(
      'Mist'
    );
  });

  it('changes a calm start within minutes at the default day length', () => {
    const atmosphere = new AtmosphereSystem();
    atmosphere.init(resolveWeatherClimate('temperate'), 2, {
      ...FAIR_START,
      state: 'Clear',
    });
    run(atmosphere, 6 * 60);
    expect(atmosphere.state).not.toBe('Clear');
  });

  it('starts from the authored knobs and eases to the weather', () => {
    const start = { ...FAIR_START, cloudiness: 0.95, state: 'Clear' as const };
    const atmosphere = system(5, 'temperate', start);
    expect(atmosphere.sample.baseKnobs.cloudiness).toBeCloseTo(0.95);
    expect(atmosphere.sample.elevation).toBe(80);
    run(atmosphere, 60);
    expect(atmosphere.base.cloudiness).toBeLessThan(0.3);
  });

  describe('wind direction', () => {
    it('changes over time', () => {
      const atmosphere = system(9);
      let low = Infinity;
      let high = -Infinity;
      run(atmosphere, 10 * 600, () => {
        const swing =
          ((((atmosphere.bearing - 180) % 360) + 540) % 360) - 180;
        low = Math.min(low, swing);
        high = Math.max(high, swing);
      });
      expect(high - low).toBeGreaterThan(40);
    });

    it('turns smoothly between states', () => {
      const atmosphere = system(9);
      let previous = atmosphere.bearing;
      run(atmosphere, 5 * 600, () => {
        expect(bearingSwing(atmosphere.bearing, previous)).toBeLessThan(2);
        previous = atmosphere.bearing;
      });
    });

    it('veers behind a front', () => {
      const atmosphere = system(4);
      atmosphere.forceState('Fair', true);
      const before = atmosphere.bearing;
      atmosphere.forceState('Clearing');
      run(atmosphere, 30);
      expect(bearingSwing(atmosphere.bearing, before)).toBeGreaterThan(15);
    });
  });

  describe('variation within a state', () => {
    it('swings the wind in short bursts in a storm', () => {
      const atmosphere = system(12);
      // A long day, so the storm holds for the whole window.
      atmosphere.cycle.cycleSeconds = 2400;
      atmosphere.forceState('Storm', true);
      let widest = 0;
      let burstSeconds = 0;
      run(atmosphere, 300, () => {
        const swing = bearingSwing(
          atmosphere.sample.windBearing,
          atmosphere.bearing
        );
        widest = Math.max(widest, swing);
        if (swing > 25) burstSeconds += 0.1;
      });
      expect(widest).toBeGreaterThan(30);
      expect(burstSeconds).toBeGreaterThan(0);
      expect(burstSeconds).toBeLessThan(150);
    });

    it('moves a clear day gently, well short of a storm', () => {
      const atmosphere = system(12);
      atmosphere.forceState('Clear', true);
      let widest = 0;
      let left = false;
      run(atmosphere, 300, () => {
        left ||= atmosphere.state !== 'Clear';
        if (left) return;
        widest = Math.max(
          widest,
          bearingSwing(atmosphere.sample.windBearing, atmosphere.bearing)
        );
      });
      expect(widest).toBeGreaterThan(5);
      expect(widest).toBeLessThan(50);
    });

    it('lets the rain rise and fall a little in a drizzle', () => {
      const atmosphere = system(21);
      atmosphere.forceState('Rain', true);
      let low = Infinity;
      let high = -Infinity;
      run(atmosphere, 120, () => {
        const offset =
          atmosphere.sample.precipitation -
          atmosphere.sample.baseKnobs.precipitation;
        low = Math.min(low, offset);
        high = Math.max(high, offset);
      });
      expect(high - low).toBeGreaterThan(0.05);
      expect(high - low).toBeLessThan(0.6);
    });

    it('adds no rain where none falls', () => {
      const atmosphere = system(21);
      atmosphere.forceState('Clear', true);
      let left = false;
      run(atmosphere, 120, () => {
        left ||= atmosphere.state !== 'Clear';
        if (left) return;
        expect(
          Math.abs(
            atmosphere.sample.precipitation -
              atmosphere.sample.baseKnobs.precipitation
          )
        ).toBeLessThan(1e-3);
      });
    });
  });

  describe('scripted events', () => {
    it('stops the weather and outputs what the script writes', () => {
      const atmosphere = system();
      run(atmosphere, 10);
      const state = atmosphere.state;
      const elapsed = atmosphere.stateElapsed;
      atmosphere.setEnabled(false);
      atmosphere.setKnobs({ cloudiness: 1, precipitation: 1, windBearing: 90 });
      run(atmosphere, 30);
      expect(atmosphere.state).toBe(state);
      expect(atmosphere.stateElapsed).toBe(elapsed);
      expect(atmosphere.sample.cloudiness).toBe(1);
      expect(atmosphere.sample.precipitation).toBe(1);
      expect(atmosphere.sample.windBearing).toBe(90);
    });

    it('eases back from where the script left the knobs', () => {
      const atmosphere = system();
      atmosphere.forceState('Clear', true);
      atmosphere.setEnabled(false);
      atmosphere.setKnobs({ cloudiness: 1 });
      atmosphere.setEnabled(true);
      atmosphere.update(0.1);
      expect(atmosphere.base.cloudiness).toBeGreaterThan(0.9);
      run(atmosphere, 60);
      expect(atmosphere.base.cloudiness).toBeLessThan(0.3);
    });
  });

  describe('modifiers', () => {
    it('fades in, wins by priority and leaves the weather beneath', () => {
      const atmosphere = system();
      atmosphere.forceState('Clear', true);
      atmosphere.addModifier({
        id: 'low',
        effects: [{ knob: 'fog', op: 'set', value: 0.2 }],
        priority: 1,
        fadeIn: 0,
        fadeOut: 0,
        targetWeight: 1,
      });
      atmosphere.addModifier({
        id: 'underwater',
        effects: [{ knob: 'fog', op: 'set', value: 0.95 }],
        priority: 100,
        fadeIn: 1,
        fadeOut: 1,
        targetWeight: 1,
      });
      atmosphere.update(0.5);
      expect(atmosphere.sample.fog).toBeGreaterThan(0.2);
      expect(atmosphere.sample.fog).toBeLessThan(0.95);
      run(atmosphere, 1);
      expect(atmosphere.sample.fog).toBeCloseTo(0.95);
      expect(atmosphere.sample.baseKnobs.fog).toBeLessThan(0.3);

      atmosphere.removeModifier('underwater');
      atmosphere.removeModifier('low');
      run(atmosphere, 1.5);
      expect(atmosphere.sample.fog).toBeCloseTo(
        atmosphere.sample.baseKnobs.fog,
        1
      );
    });
  });
});
