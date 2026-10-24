import { Transform } from 'rewild-renderer';
import { BehaviourState, IBehaviour } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { BehaviourManager } from './BehaviourManager';
import { PortalTrigger } from './behaviours/PortalTrigger';
import { Spin } from './behaviours/Spin';

/** Counts its own updates and remembers a target by id. */
class Counter implements IBehaviour {
  name = 'counter';
  ticks = 0;
  targetId: string | null = null;

  onUpdate(): void {
    this.ticks++;
  }

  serialize(): BehaviourState {
    return { ticks: this.ticks, targetId: this.targetId };
  }

  restore(state: BehaviourState): void {
    if (typeof state.ticks === 'number') this.ticks = state.ticks;
    if (typeof state.targetId === 'string' || state.targetId === null)
      this.targetId = state.targetId;
  }
}

function manager(): BehaviourManager {
  const behaviours = new BehaviourManager();
  behaviours.register('counter', () => new Counter());
  return behaviours;
}

describe('BehaviourManager', () => {
  it('creates spin by default', () => {
    expect(new BehaviourManager().create('spin')).toBeInstanceOf(Spin);
  });

  it('creates a new instance on every call', () => {
    const behaviours = manager();
    expect(behaviours.create('counter')).not.toBe(behaviours.create('counter'));
    expect(behaviours.create('spin')).not.toBe(behaviours.create('spin'));
  });

  it('returns null for a name it does not hold', () => {
    const behaviours = manager();
    behaviours.unregister('counter');

    expect(behaviours.has('counter')).toBe(false);
    expect(behaviours.create('counter')).toBeNull();
  });

  it('creates every named behaviour, and throws on an unknown one', () => {
    const behaviours = manager();

    const created = behaviours.createAll(['spin', 'counter']);
    expect(created.map((b) => b.name)).toEqual(['spin', 'counter']);
    expect(() => behaviours.createAll(['spin', 'fly'])).toThrow('fly');
  });

  it('keeps separate state for two assets with the same behaviour', () => {
    const behaviours = manager();
    const [a] = behaviours.createAll(['counter']) as Counter[];
    const [b] = behaviours.createAll(['counter']) as Counter[];

    a.onUpdate();
    a.onUpdate();
    b.onUpdate();

    expect(a.ticks).toBe(2);
    expect(b.ticks).toBe(1);
  });

  it('restores state from plain data', () => {
    const behaviours = manager();
    const a = behaviours.create('counter') as Counter;
    a.onUpdate();
    a.targetId = 'player';

    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = behaviours.create('counter') as Counter;
    b.restore(saved);

    expect(b.ticks).toBe(1);
    expect(b.targetId).toBe('player');
    expect(b.serialize()).toEqual(a.serialize());
  });

  it('keeps its values for fields the state leaves out', () => {
    const counter = new Counter();
    counter.ticks = 4;
    counter.restore({});

    expect(counter.ticks).toBe(4);
  });
});

describe('PortalTrigger', () => {
  it('round-trips whether it is armed', () => {
    const trigger = new PortalTrigger();
    trigger.restore({ armed: true });
    const copy = new PortalTrigger();
    copy.restore(trigger.serialize());

    expect(copy.serialize()).toEqual({ armed: true });
    copy.onMount();
    expect(copy.serialize()).toEqual({ armed: false });
  });
});

describe('Spin', () => {
  it('turns each asset it is created for', () => {
    const behaviours = new BehaviourManager();
    const assets = [new Asset3D(new Transform()), new Asset3D(new Transform())];
    for (const asset of assets)
      for (const behaviour of behaviours.createAll(['spin']))
        asset.addBehavior(behaviour);

    for (const asset of assets) asset.behaviours[0].onUpdate(1, 0, asset);

    expect(assets[0].behaviours[0]).not.toBe(assets[1].behaviours[0]);
    for (const asset of assets)
      expect(asset.transform.rotation.y).toBeCloseTo(0.5);
  });

  it('has no state to save', () => {
    expect(new Spin().serialize()).toEqual({});
  });
});
