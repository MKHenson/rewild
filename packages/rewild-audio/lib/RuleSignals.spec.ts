import { RuleSignals, STATE_EASE } from './RuleSignals';

function makeSignals() {
  return new RuleSignals({
    numbers: ['windiness', 'rain'],
    states: { state: ['Clear', 'Storm'], time: ['Day', 'Night'] },
  });
}

describe('RuleSignals', () => {
  it('types the names a schema declares', () => {
    const signals = makeSignals();
    signals.set('windiness', 0.5);
    signals.setState('state', 'Storm');
    // @ts-expect-error not a declared number signal
    signals.set('windyness', 0.5);
    // @ts-expect-error not a value of the state signal
    signals.setState('state', 'Blizzard');
    // @ts-expect-error not a declared state signal
    signals.setState('weather', 'Clear');
    expect(signals.get('windiness')).toBe(0.5);
  });

  it('indexes its number signals and state values, and -1 for unknown ones', () => {
    const signals = makeSignals();
    expect(signals.numberIndex('windiness')).toBe(0);
    expect(signals.numberIndex('rain')).toBe(1);
    expect(signals.numberIndex('heat')).toBe(-1);
    expect(signals.stateIndex('state', 'Storm')).toBe(1);
    expect(signals.stateIndex('time', 'Day')).toBe(2);
    expect(signals.stateIndex('state', 'Blizzard')).toBe(-1);
    expect(signals.isState('state')).toBe(true);
    expect(signals.isState('rain')).toBe(false);
  });

  it('writes a number signal where its index points', () => {
    const signals = makeSignals();
    signals.set('rain', 0.25);
    expect(signals.values[signals.numberIndex('rain')]).toBe(0.25);
  });

  it('eases a state in over a few seconds and out after it ends', () => {
    const signals = makeSignals();
    const storm = signals.stateIndex('state', 'Storm');
    const clear = signals.stateIndex('state', 'Clear');

    signals.setState('state', 'Storm');
    expect(signals.stateWeight(storm)).toBe(0);
    signals.update(STATE_EASE / 2);
    expect(signals.stateWeight(storm)).toBeCloseTo(0.5, 6);
    signals.update(STATE_EASE);
    expect(signals.stateWeight(storm)).toBe(1);

    signals.setState('state', 'Clear');
    signals.update(STATE_EASE / 4);
    expect(signals.stateWeight(storm)).toBeGreaterThan(0.5);
    expect(signals.stateWeight(clear)).toBeLessThan(0.5);
    signals.update(STATE_EASE);
    expect(signals.stateWeight(storm)).toBe(0);
    expect(signals.stateWeight(clear)).toBe(1);
  });

  it('eases each state signal on its own', () => {
    const signals = makeSignals();
    signals.setState('state', 'Storm');
    signals.setState('time', 'Night');
    signals.update(STATE_EASE);
    expect(signals.stateWeight(signals.stateIndex('state', 'Storm'))).toBe(1);
    expect(signals.stateWeight(signals.stateIndex('time', 'Night'))).toBe(1);
  });

  it('snaps the states to where they are on settle', () => {
    const signals = makeSignals();
    signals.setState('state', 'Storm');
    signals.settle();
    expect(signals.stateWeight(signals.stateIndex('state', 'Storm'))).toBe(1);
    expect(signals.stateWeight(signals.stateIndex('state', 'Clear'))).toBe(0);
  });

  it('leaves a state in none for an unknown value', () => {
    const signals = new RuleSignals({
      numbers: [],
      states: { state: ['Clear', 'Storm'] },
    });
    signals.setState('state', 'Storm');
    signals.settle();
    signals.setState('state', 'Blizzard' as 'Clear');
    signals.update(STATE_EASE);
    expect(signals.stateWeight(signals.stateIndex('state', 'Storm'))).toBe(0);
    expect(signals.stateWeight(signals.stateIndex('state', 'Clear'))).toBe(0);
  });
});
