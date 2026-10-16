import { ARC_POINTS, MAX_ARCS, PortalArcs } from './PortalArcs';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const STEP = 1 / 60;
const RADIUS = 3;
const CENTRE = [10, 5, -20] as const;

function run(arcs: PortalArcs, seconds: number, onStep?: () => void) {
  for (let t = 0; t < seconds; t += STEP) {
    arcs.update(STEP, CENTRE[0], CENTRE[1], CENTRE[2], RADIUS);
    onStep?.();
  }
}

const live = (arcs: PortalArcs) =>
  Array.from(arcs.brightness).filter((b) => b > 0).length;

describe('PortalArcs', () => {
  it('fires bursts of bolts over time', () => {
    const arcs = new PortalArcs(seeded());
    let seen = 0;
    run(arcs, 5, () => (seen = Math.max(seen, live(arcs))));
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(MAX_ARCS);
  });

  it('lets each bolt die out after it lights', () => {
    const arcs = new PortalArcs(seeded(7));
    const lit = new Array(MAX_ARCS).fill(false);
    let died = 0;
    run(arcs, 5, () => {
      for (let i = 0; i < MAX_ARCS; i++) {
        if (arcs.brightness[i] > 0) lit[i] = true;
        else if (lit[i]) {
          lit[i] = false;
          died++;
        }
      }
    });
    expect(died).toBeGreaterThan(0);
  });

  it('sums the live bolts into the flash', () => {
    const arcs = new PortalArcs(seeded(3));
    run(arcs, 5, () => {
      const sum = Array.from(arcs.brightness).reduce((a, b) => a + b, 0);
      expect(arcs.flash).toBeCloseTo(sum, 5);
    });
  });

  it('starts each bolt on the sphere and reaches out past it', () => {
    const arcs = new PortalArcs(seeded(11));
    let checked = 0;
    run(arcs, 5, () => {
      for (let i = 0; i < MAX_ARCS; i++) {
        if (arcs.brightness[i] <= 0) continue;
        const p = i * ARC_POINTS * 3;
        const last = p + (ARC_POINTS - 1) * 3;
        const from = (o: number) =>
          Math.hypot(
            arcs.paths[o] - CENTRE[0],
            arcs.paths[o + 1] - CENTRE[1],
            arcs.paths[o + 2] - CENTRE[2]
          );
        expect(from(p)).toBeCloseTo(RADIUS, 3);
        expect(from(last)).toBeGreaterThan(RADIUS);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('is dark before the first burst', () => {
    const arcs = new PortalArcs(seeded(5));
    arcs.update(STEP, CENTRE[0], CENTRE[1], CENTRE[2], RADIUS);
    expect(arcs.flash).toBe(0);
  });

  it('bursts more often at a higher rate', () => {
    const spawned = (rate: number) => {
      const arcs = new PortalArcs(seeded(9));
      arcs.rate = rate;
      let count = 0;
      let before = 0;
      run(arcs, 10, () => {
        const now = live(arcs);
        if (now > before) count += now - before;
        before = now;
      });
      return count;
    };
    expect(spawned(6)).toBeGreaterThan(spawned(1) * 2);
  });

  it('makes no new bolts while not spawning', () => {
    const arcs = new PortalArcs(seeded(2));
    arcs.spawning = false;
    run(arcs, 5);
    expect(arcs.flash).toBe(0);
  });
});
