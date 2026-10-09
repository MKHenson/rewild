import { RANGE, RuleConditions, STATE, rangeWeight } from './RuleConditions';
import { RuleSignals } from './RuleSignals';

const signals = new RuleSignals({
  numbers: ['windiness', 'sun'],
  states: { state: ['Clear', 'Storm'] },
});

describe('rangeWeight', () => {
  it('weighs 0 at the start of a range and 1 at its end, eased', () => {
    expect(rangeWeight(0.4, 0.4, 0.8)).toBe(0);
    expect(rangeWeight(0.6, 0.4, 0.8)).toBeCloseTo(0.5, 6);
    expect(rangeWeight(0.8, 0.4, 0.8)).toBe(1);
    expect(rangeWeight(0.45, 0.4, 0.8)).toBeLessThan(0.125);
  });

  it('holds outside the range', () => {
    expect(rangeWeight(0, 0.4, 0.8)).toBe(0);
    expect(rangeWeight(1, 0.4, 0.8)).toBe(1);
  });

  it('rises as the signal falls when the range runs downward', () => {
    expect(rangeWeight(0.1, 0.1, -0.2)).toBe(0);
    expect(rangeWeight(-0.05, 0.1, -0.2)).toBeCloseTo(0.5, 6);
    expect(rangeWeight(-0.2, 0.1, -0.2)).toBe(1);
  });

  it('steps at a range of one point', () => {
    expect(rangeWeight(0.49, 0.5, 0.5)).toBe(0);
    expect(rangeWeight(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe('RuleConditions', () => {
  it('lays out each condition flat and returns where it starts', () => {
    const conds = new RuleConditions();
    expect(conds.add({ windiness: [0.4, 0.8] }, signals, 'a')).toEqual([0, 1]);
    expect(
      conds.add({ sun: [0.1, -0.2], state: 'Storm' }, signals, 'b')
    ).toEqual([1, 2]);

    expect(conds.kinds).toEqual([RANGE, RANGE, STATE]);
    expect(conds.indices).toEqual([
      signals.numberIndex('windiness'),
      signals.numberIndex('sun'),
      signals.stateIndex('state', 'Storm'),
    ]);
    expect(conds.froms.slice(0, 2)).toEqual([0.4, 0.1]);
    expect(conds.tos.slice(0, 2)).toEqual([0.8, -0.2]);
  });

  it('adds nothing for no condition', () => {
    const conds = new RuleConditions();
    expect(conds.add(undefined, signals, 'a')).toEqual([0, 0]);
    expect(conds.kinds).toHaveLength(0);
  });

  it('throws on an unknown signal, state or state value', () => {
    const conds = new RuleConditions();
    expect(() => conds.add({ heat: [0, 1] }, signals, 'Rule "a"')).toThrow(
      'Rule "a": no number signal "heat"'
    );
    expect(() => conds.add({ weather: 'Storm' }, signals, 'Rule "a"')).toThrow(
      'Rule "a": no state signal "weather"'
    );
    expect(() => conds.add({ state: 'Blizzard' }, signals, 'Rule "a"')).toThrow(
      'Rule "a": "Blizzard" is not a value of "state"'
    );
  });
});
