import { MetricsRegistry } from './MetricsRegistry';

const makeRegistry = () => {
  const registry = new MetricsRegistry();
  registry.enabled = true;
  return registry;
};

const view = (registry: MetricsRegistry, key: string) =>
  registry.snapshot().find((v) => v.key === key)!;

describe('MetricsRegistry', () => {
  it('records nothing while disabled', () => {
    const registry = new MetricsRegistry();
    registry.record('a', 5, { label: 'a', group: 'g' });
    expect(registry.snapshot()).toHaveLength(0);
  });

  it('reports the average and the peak of the window separately', () => {
    const registry = makeRegistry();
    registry.record('a', 1, { label: 'a', group: 'g' });
    registry.record('a', 9);

    expect(view(registry, 'a').perRun).toBeCloseTo(5, 5);
    expect(view(registry, 'a').max).toBeCloseTo(9, 5);
  });

  it('amortises a pass that only runs on some ticks', () => {
    const registry = makeRegistry();
    registry.declare('pass', { label: 'pass', group: 'g' });

    // Nine milliseconds, but only on every second tick.
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) registry.record('pass', 9);
      else registry.skip('pass');
    }

    const result = view(registry, 'pass');
    expect(result.perRun).toBeCloseTo(9, 5);
    expect(result.duty).toBeCloseTo(0.5, 5);
    expect(result.perFrame).toBeCloseTo(4.5, 5);
  });

  it('leaves counts alone rather than scaling them by duty', () => {
    const registry = makeRegistry();
    registry.declare('n', { label: 'n', group: 'g', kind: 'count' });
    registry.record('n', 400);
    registry.skip('n');

    expect(view(registry, 'n').perFrame).toBe(400);
  });

  it('times a span between begin and end', () => {
    const registry = makeRegistry();
    registry.declare('span', { label: 'span', group: 'g' });
    registry.begin('span');
    registry.end('span');

    expect(view(registry, 'span').perRun).toBeGreaterThanOrEqual(0);
    expect(view(registry, 'span').duty).toBe(1);
  });

  it('ignores an end with no matching begin', () => {
    const registry = makeRegistry();
    registry.declare('span', { label: 'span', group: 'g' });
    registry.end('span');

    expect(registry.snapshot()).toHaveLength(0);
  });

  it('drops only the window on reset, keeping declarations', () => {
    const registry = makeRegistry();
    registry.record('a', 5, { label: 'a', group: 'g' });
    registry.reset();
    expect(registry.snapshot()).toHaveLength(0);

    registry.record('a', 7);
    expect(view(registry, 'a').perRun).toBeCloseTo(7, 5);
  });

  it('sorts by group, then by declared order', () => {
    const registry = makeRegistry();
    registry.record('b', 1, { label: 'b', group: 'zzz', order: 0 });
    registry.record('a2', 1, { label: 'a2', group: 'aaa', order: 1 });
    registry.record('a1', 1, { label: 'a1', group: 'aaa', order: 0 });

    expect(registry.snapshot().map((v) => v.key)).toEqual(['a1', 'a2', 'b']);
  });
});
