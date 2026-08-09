import { createNautilusGeometry } from './nautilus';

const coordsOf = (d: string) =>
  d
    .split(/[MLQZ]/)
    .filter(Boolean)
    .flatMap((segment) => segment.trim().split(/\s+/).map(Number));

describe('createNautilusGeometry', () => {
  it('produces one chamber per requested division', () => {
    expect(createNautilusGeometry({ chambers: 8 }).chambers.length).toBe(8);
    expect(createNautilusGeometry({ chambers: 40 }).chambers.length).toBe(40);
  });

  it('normalises to a square viewBox of the requested size', () => {
    expect(createNautilusGeometry().viewBox).toBe('0 0 100 100');
    expect(createNautilusGeometry({ viewSize: 64 }).viewBox).toBe('0 0 64 64');
  });

  it('keeps every point inside the viewBox', () => {
    const geometry = createNautilusGeometry({ viewSize: 100 });
    const all = geometry.chambers.flatMap((chamber) => coordsOf(chamber.d));

    expect(all.length).toBeGreaterThan(0);
    expect(all.every((value) => Number.isFinite(value))).toBe(true);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...all)).toBeLessThanOrEqual(100);
  });

  it('ramps t from the innermost chamber to the outermost', () => {
    const { chambers } = createNautilusGeometry({ chambers: 5 });

    expect(chambers[0].t).toBe(0);
    expect(chambers[chambers.length - 1].t).toBe(1);
    for (let i = 1; i < chambers.length; i++) {
      expect(chambers[i].t).toBeGreaterThan(chambers[i - 1].t);
    }
  });

  it('collapses t to zero for a single chamber', () => {
    expect(createNautilusGeometry({ chambers: 1 }).chambers[0].t).toBe(0);
  });

  it('emits closed paths', () => {
    for (const chamber of createNautilusGeometry({ chambers: 6 }).chambers) {
      expect(chamber.d.startsWith('M')).toBe(true);
      expect(chamber.d.endsWith('Z')).toBe(true);
    }
  });

  it('grows the shell by growthPerTurn over each revolution', () => {
    // One chamber per turn puts every chamber's start point on the same ray,
    // so the gaps between them grow by exactly the growth factor. Measuring
    // gaps rather than radii keeps the check free of where normalisation
    // happened to place the pole.
    const geometry = createNautilusGeometry({
      chambers: 3,
      turns: 3,
      growthPerTurn: 2,
    });

    const start = (index: number) => coordsOf(geometry.chambers[index].d);
    const gap = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

    const first = gap(start(0), start(1));
    const second = gap(start(1), start(2));

    // Path coordinates are rounded to 3dp, so the ratio carries a little noise.
    expect(second / first).toBeCloseTo(2, 3);
  });
});
