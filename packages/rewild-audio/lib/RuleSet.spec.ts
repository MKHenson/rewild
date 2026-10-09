import { OPEN_CUTOFF_HZ } from './constants';
import { RuleSet } from './RuleSet';
import { RuleSignals, STATE_EASE } from './RuleSignals';
import { RuleSetDef } from './RuleTypes';

function makeSignals(): RuleSignals {
  return new RuleSignals({
    numbers: ['windiness', 'rain', 'sun', 'snow'],
    states: { state: ['Clear', 'Storm', 'Clearing'] },
  });
}

/** The gain of the slot with `id` playing `sound`. */
function gainOf(set: RuleSet, id: string, sound?: string): number {
  const i = set.slotIds.findIndex(
    (slotId, s) =>
      slotId === id && (sound === undefined || set.slotSounds[s] === sound)
  );
  if (i < 0) throw new Error(`no slot ${id} ${sound ?? ''}`);
  return set.gains[i];
}

function cutoffOf(set: RuleSet, id: string): number {
  return set.cutoffs[set.slotIds.indexOf(id)];
}

const forest: RuleSetDef = {
  layers: [
    { id: 'leaves', sound: 'leaves-calm' },
    {
      id: 'birds',
      sound: 'birds-day',
      tags: ['wildlife', 'birds'],
      when: { sun: [-0.1, 0.2] },
    },
    {
      id: 'night',
      sound: 'night',
      tags: ['wildlife'],
      when: { sun: [0.1, -0.2] },
    },
  ],
};

let signals: RuleSignals;

beforeEach(() => {
  signals = makeSignals();
});

describe('conditions', () => {
  it('plays a layer by its own condition', () => {
    const set = new RuleSet(signals, forest);
    signals.set('sun', -0.5);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBe(0);
    expect(gainOf(set, 'night')).toBe(1);
    signals.set('sun', 0.05);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBeCloseTo(0.5, 6);
  });

  it('follows a state condition as its weight eases', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [{ when: { state: 'Storm' }, scale: 'leaves', by: 0 }],
    });
    signals.setState('state', 'Storm');
    set.evaluate();
    expect(gainOf(set, 'leaves')).toBe(1);
    signals.update(STATE_EASE / 2);
    set.evaluate();
    expect(gainOf(set, 'leaves')).toBeCloseTo(0.5, 6);
    signals.settle();
    set.evaluate();
    expect(gainOf(set, 'leaves')).toBe(0);
  });

  it('multiplies the weights of more than one condition', () => {
    const set = new RuleSet(signals, {
      layers: [{ id: 'leaves', sound: 'leaves-calm' }],
      rules: [
        {
          when: { windiness: [0, 1], rain: [0, 1] },
          scale: 'leaves',
          by: 0,
        },
      ],
    });
    signals.set('windiness', 1);
    signals.set('rain', 0.5);
    set.evaluate();
    expect(set.ruleWeights[0]).toBeCloseTo(0.5, 6);
    signals.set('rain', 0);
    set.evaluate();
    expect(set.ruleWeights[0]).toBe(0);
  });
});

describe('actions', () => {
  it('adds a sound at its gain times the weight', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { id: 'creak', when: { windiness: [0.6, 1] }, add: 'creak', gain: 0.6 },
      ],
    });
    signals.set('windiness', 1);
    set.evaluate();
    expect(gainOf(set, 'creak')).toBeCloseTo(0.6, 6);
    signals.set('windiness', 0.6);
    set.evaluate();
    expect(gainOf(set, 'creak')).toBe(0);
  });

  it('replaces a layer with a crossfade', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        {
          when: { windiness: [0.4, 0.8] },
          replace: 'leaves',
          with: 'leaves-gale',
        },
      ],
    });
    signals.set('windiness', 0.6);
    set.evaluate();
    expect(gainOf(set, 'leaves', 'leaves-calm')).toBeCloseTo(0.5, 6);
    expect(gainOf(set, 'leaves', 'leaves-gale')).toBeCloseTo(0.5, 6);
    signals.set('windiness', 1);
    set.evaluate();
    expect(gainOf(set, 'leaves', 'leaves-calm')).toBe(0);
    expect(gainOf(set, 'leaves', 'leaves-gale')).toBe(1);
  });

  it('carries a replaced layer over to the new sound, day and night too', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [{ when: { rain: [0, 1] }, replace: 'birds', with: 'birds-wet' }],
    });
    signals.set('rain', 1);
    signals.set('sun', -0.5);
    set.evaluate();
    expect(gainOf(set, 'birds', 'birds-wet')).toBe(0);
    signals.set('sun', 0.5);
    set.evaluate();
    expect(gainOf(set, 'birds', 'birds-wet')).toBe(1);
  });

  it('scales a layer between 1 and its factor by the weight', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [{ when: { rain: [0, 1] }, scale: '#birds', by: 1.6 }],
    });
    signals.set('sun', 1);
    signals.set('rain', 0.5);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBeCloseTo(1.3, 6);
  });

  it('muffles a layer from open toward its cutoff', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [{ when: { snow: [0, 1] }, muffle: '*', cutoff: 2000 }],
    });
    signals.set('snow', 0);
    set.evaluate();
    expect(cutoffOf(set, 'leaves')).toBe(OPEN_CUTOFF_HZ);
    signals.set('snow', 1);
    set.evaluate();
    expect(cutoffOf(set, 'leaves')).toBeCloseTo(2000, 1);
    expect(cutoffOf(set, 'night')).toBeCloseTo(2000, 1);
  });

  it('keeps the lower cutoff when two muffles act on one layer', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { when: { snow: [0, 1] }, muffle: 'leaves', cutoff: 2500 },
        { when: { rain: [0, 1] }, muffle: 'leaves', cutoff: 4000 },
      ],
    });
    signals.set('snow', 1);
    signals.set('rain', 1);
    set.evaluate();
    expect(cutoffOf(set, 'leaves')).toBeCloseTo(2500, 1);
  });

  it('targets tags, every layer, and lists', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { when: { rain: [0, 1] }, scale: '#wildlife', by: 0 },
        { when: { rain: [0, 1] }, scale: ['leaves', '#birds'], by: 0.5 },
      ],
    });
    signals.set('sun', 1);
    signals.set('rain', 1);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBe(0);
    expect(gainOf(set, 'leaves')).toBe(0.5);
  });

  it('scales each layer by the caller first', () => {
    const set = new RuleSet(signals, {
      layers: [
        { id: 'grass', sound: 'step-grass', tags: ['ground'] },
        { id: 'rock', sound: 'step-rock', tags: ['ground'] },
      ],
    });
    set.evaluate([0.7, 0.3]);
    expect(gainOf(set, 'grass')).toBeCloseTo(0.7, 6);
    expect(gainOf(set, 'rock')).toBeCloseTo(0.3, 6);
  });
});

describe('rule order', () => {
  it('scales the new sound when a scale follows a replace', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { when: { windiness: [0, 1] }, replace: 'leaves', with: 'leaves-gale' },
        { when: { rain: [0, 1] }, scale: 'leaves', by: 0.5 },
      ],
    });
    signals.set('windiness', 1);
    signals.set('rain', 1);
    set.evaluate();
    expect(gainOf(set, 'leaves', 'leaves-gale')).toBe(0.5);
  });

  it('leaves the new sound alone when the scale comes first', () => {
    const set = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { when: { rain: [0, 1] }, scale: 'leaves', by: 0.5 },
        { when: { windiness: [0, 1] }, replace: 'leaves', with: 'leaves-gale' },
      ],
    });
    signals.set('windiness', 1);
    signals.set('rain', 1);
    set.evaluate();
    expect(gainOf(set, 'leaves', 'leaves-gale')).toBe(0.5);

    const added = new RuleSet(signals, {
      layers: forest.layers,
      rules: [
        { when: { rain: [0, 1] }, scale: '*', by: 0.5 },
        { id: 'creak', when: { windiness: [0, 1] }, add: 'creak' },
      ],
    });
    added.evaluate();
    expect(gainOf(added, 'creak')).toBe(1);
  });
});

describe('base profiles', () => {
  const base: RuleSetDef = {
    rules: [
      {
        id: 'gale-quiets-wildlife',
        when: { windiness: [0.7, 1] },
        scale: '#wildlife',
        by: 0.3,
      },
      {
        id: 'rain-quiets-wildlife',
        when: { rain: [0.1, 0.5] },
        scale: '#wildlife',
        by: 0,
      },
    ],
  };

  it('applies the base rules before its own', () => {
    const set = new RuleSet(
      signals,
      {
        layers: forest.layers,
        rules: [{ id: 'own', when: { rain: [0, 1] }, scale: 'leaves', by: 1 }],
      },
      base
    );
    expect(set.ruleIds).toEqual([
      'gale-quiets-wildlife',
      'rain-quiets-wildlife',
      'own',
    ]);
    signals.set('sun', 1);
    signals.set('windiness', 1);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBeCloseTo(0.3, 6);
  });

  it('turns a base rule off with without', () => {
    const set = new RuleSet(
      signals,
      { layers: forest.layers, without: ['gale-quiets-wildlife'] },
      base
    );
    expect(set.ruleIds).toEqual(['rain-quiets-wildlife']);
    signals.set('sun', 1);
    signals.set('windiness', 1);
    set.evaluate();
    expect(gainOf(set, 'birds')).toBe(1);
  });

  it('lets a base tag match no layer', () => {
    expect(
      () =>
        new RuleSet(signals, { layers: [{ id: 'air', sound: 'air' }] }, base)
    ).not.toThrow();
  });
});

describe('compiling', () => {
  it('names the layer or rule a bad condition is in', () => {
    expect(
      () =>
        new RuleSet(signals, {
          layers: [{ id: 'a', sound: 'a', when: { heat: [0, 1] } }],
        })
    ).toThrow('Layer "a": no number signal "heat"');
    expect(
      () =>
        new RuleSet(signals, {
          rules: [{ id: 'b', when: { state: 'Blizzard' }, add: 'b' }],
        })
    ).toThrow('Rule "b": "Blizzard" is not a value of "state"');
  });

  it('throws on an unknown layer or base rule', () => {
    expect(
      () =>
        new RuleSet(signals, {
          rules: [{ when: {}, scale: 'leaves', by: 0 }],
        })
    ).toThrow('no layer "leaves"');
    expect(() => new RuleSet(signals, { without: ['nope'] }, {})).toThrow(
      'no base rule "nope"'
    );
  });

  it('throws on a rule with no action or two', () => {
    expect(() => new RuleSet(signals, { rules: [{ when: {} }] })).toThrow(
      'needs one of'
    );
    expect(
      () =>
        new RuleSet(signals, {
          layers: forest.layers,
          rules: [{ when: {}, add: 'a', scale: 'leaves' }],
        })
    ).toThrow('needs one of');
  });

  it('writes into the same arrays every evaluation', () => {
    const set = new RuleSet(signals, forest);
    const { gains, cutoffs, ruleWeights } = set;
    set.evaluate();
    set.evaluate();
    expect(set.gains).toBe(gains);
    expect(set.cutoffs).toBe(cutoffs);
    expect(set.ruleWeights).toBe(ruleWeights);
  });
});
