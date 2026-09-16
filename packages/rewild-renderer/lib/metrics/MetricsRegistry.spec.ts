import { MetricsRegistry } from './MetricsRegistry';

/** Frames the registry discards after a reset. Mirrors WARMUP_FRAMES. */
const WARMUP = 30;

const makeRegistry = () => {
  const registry = new MetricsRegistry();
  registry.enabled = true;
  for (let i = 0; i < WARMUP; i++) registry.beginFrame();
  return registry;
};

/** Advance the frame counter, which is what duty is measured against. */
const runFrames = (registry: MetricsRegistry, count: number) => {
  for (let i = 0; i < count; i++) registry.beginFrame();
};

const view = (registry: MetricsRegistry, key: string) =>
  registry.snapshot().find((v) => v.key === key)!;

describe('MetricsRegistry', () => {
  it('records nothing while disabled', () => {
    const registry = new MetricsRegistry();
    registry.record('a', 5, { label: 'a', group: 'g' });
    expect(registry.snapshot()).toHaveLength(0);
  });

  it('discards the frames after a reset while pipelines rebuild', () => {
    const registry = new MetricsRegistry();
    registry.enabled = true;

    expect(registry.settling).toBe(true);
    registry.beginFrame();
    registry.record('a', 999, { label: 'a', group: 'g' });
    expect(registry.snapshot()).toHaveLength(0);

    runFrames(registry, WARMUP);
    expect(registry.settling).toBe(false);
    registry.record('a', 5);
    expect(view(registry, 'a').perRun).toBeCloseTo(5, 5);
  });

  it('reports the mean and the peak of the window separately', () => {
    const registry = makeRegistry();
    runFrames(registry, 2);
    registry.record('a', 1, { label: 'a', group: 'g' });
    registry.record('a', 9);

    expect(view(registry, 'a').perRun).toBeCloseTo(5, 5);
    expect(view(registry, 'a').max).toBeCloseTo(9, 5);
  });

  it('derives duty from samples per frame', () => {
    const registry = makeRegistry();
    registry.declare('pass', { label: 'pass', group: 'g' });

    // Nine milliseconds, published on one frame in six.
    for (let i = 0; i < 60; i++) {
      registry.beginFrame();
      if (i % 6 === 0) registry.record('pass', 9);
    }

    const result = view(registry, 'pass');
    expect(result.perRun).toBeCloseTo(9, 5);
    expect(result.duty).toBeCloseTo(1 / 6, 2);
    expect(result.perFrame).toBeCloseTo(1.5, 2);
  });

  it('takes duty from activity, not value arrivals, when tracked', () => {
    const registry = makeRegistry();
    registry.declare('pass', {
      label: 'pass',
      group: 'g',
      activityTracked: true,
    });

    // The pass runs every frame. Its cost only reads back on two frames in
    // three, which is what a GPU readback actually does.
    for (let i = 0; i < 60; i++) {
      registry.beginFrame();
      registry.markActive('pass');
      if (i % 3 !== 0) registry.record('pass', 20);
    }

    const result = view(registry, 'pass');
    expect(result.perRun).toBeCloseTo(20, 5);
    expect(result.duty).toBeCloseTo(1, 5);
    expect(result.perFrame).toBeCloseTo(20, 5);
  });

  it('still amortises a tracked metric that genuinely runs periodically', () => {
    const registry = makeRegistry();
    registry.declare('pass', {
      label: 'pass',
      group: 'g',
      activityTracked: true,
    });

    for (let i = 0; i < 60; i++) {
      registry.beginFrame();
      if (i % 6 === 0) {
        registry.markActive('pass');
        registry.record('pass', 9);
      }
    }

    const result = view(registry, 'pass');
    expect(result.duty).toBeCloseTo(1 / 6, 2);
    expect(result.perFrame).toBeCloseTo(1.5, 2);
  });

  it('gives a metric published every frame a duty of one', () => {
    const registry = makeRegistry();
    registry.declare('pass', { label: 'pass', group: 'g' });

    for (let i = 0; i < 30; i++) {
      registry.beginFrame();
      registry.record('pass', 4);
    }

    expect(view(registry, 'pass').duty).toBeCloseTo(1, 5);
    expect(view(registry, 'pass').perFrame).toBeCloseTo(4, 5);
  });

  it('caps duty at one so a double publish cannot inflate a share', () => {
    const registry = makeRegistry();
    registry.declare('pass', { label: 'pass', group: 'g' });

    for (let i = 0; i < 10; i++) {
      registry.beginFrame();
      registry.record('pass', 4);
      registry.record('pass', 4);
    }

    expect(view(registry, 'pass').duty).toBe(1);
    expect(view(registry, 'pass').perFrame).toBeCloseTo(4, 5);
  });

  it('leaves counts alone rather than scaling them by duty', () => {
    const registry = makeRegistry();
    registry.declare('n', { label: 'n', group: 'g', kind: 'count' });
    runFrames(registry, 10);
    registry.record('n', 400);

    expect(view(registry, 'n').perFrame).toBe(400);
  });

  it('times a span between begin and end', () => {
    const registry = makeRegistry();
    registry.declare('span', { label: 'span', group: 'g' });
    runFrames(registry, 1);
    registry.begin('span');
    registry.end('span');

    expect(view(registry, 'span').perRun).toBeGreaterThanOrEqual(0);
  });

  it('ignores an end with no matching begin', () => {
    const registry = makeRegistry();
    registry.declare('span', { label: 'span', group: 'g' });
    registry.end('span');

    expect(registry.snapshot()).toHaveLength(0);
  });

  it('drops the window and re-arms the warm-up on reset', () => {
    const registry = makeRegistry();
    runFrames(registry, 1);
    registry.record('a', 5, { label: 'a', group: 'g' });
    expect(registry.snapshot()).toHaveLength(1);

    registry.reset();
    expect(registry.snapshot()).toHaveLength(0);
    expect(registry.settling).toBe(true);

    runFrames(registry, WARMUP + 1);
    registry.record('a', 7);
    expect(view(registry, 'a').perRun).toBeCloseTo(7, 5);
  });

  it('sorts by group, then by declared order', () => {
    const registry = makeRegistry();
    runFrames(registry, 1);
    registry.record('b', 1, { label: 'b', group: 'zzz', order: 0 });
    registry.record('a2', 1, { label: 'a2', group: 'aaa', order: 1 });
    registry.record('a1', 1, { label: 'a1', group: 'aaa', order: 0 });

    expect(registry.snapshot().map((v) => v.key)).toEqual(['a1', 'a2', 'b']);
  });
});
