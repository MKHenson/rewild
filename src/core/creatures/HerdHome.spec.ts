import { LandHabitat } from './Habitat';
import { HerdHome } from './HerdHome';
import { TestWorld } from './testWorld';

function setup(speed = 1, roam = 20) {
  const world = new TestWorld();
  const habitat = new LandHabitat(
    { type: 'land', waterDepth: { from: 0.3, to: 0.2 } },
    world
  );
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const home = new HerdHome(0, 0, 0, speed, roam, habitat, random);
  return { world, home };
}

function run(home: HerdHome, seconds: number, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) home.update(dt);
}

describe('HerdHome', () => {
  it('stays at its origin with no drift', () => {
    const { home } = setup(0);
    run(home, 10);
    expect(home.x).toBe(0);
    expect(home.z).toBe(0);
  });

  it('drifts at its speed', () => {
    const { home } = setup(0.5);
    home.update(1);
    expect(Math.hypot(home.x, home.z)).toBeCloseTo(0.5);
  });

  it('stays within its roam of the origin', () => {
    const { home } = setup(2, 15);
    let furthest = 0;
    for (let i = 0; i < 2000; i++) {
      home.update(0.1);
      furthest = Math.max(furthest, Math.hypot(home.x, home.z));
    }
    expect(furthest).toBeGreaterThan(10);
    expect(furthest).toBeLessThan(15 + 2 * 0.1 + 0.001);
  });

  it('rests, then travels, by turns', () => {
    const { home } = setup(1);
    home.cycle = { settle: [5, 5], travel: [3, 3] };
    home.update(0.1);
    expect(home.resting).toBe(true);
    expect(home.moving).toBe(false);
    run(home, 4.5);
    expect(Math.hypot(home.x, home.z)).toBe(0);
    run(home, 1.5);
    expect(home.moving).toBe(true);
    run(home, 1.5);
    expect(Math.hypot(home.x, home.z)).toBeGreaterThan(1.5);
    run(home, 1);
    expect(home.resting).toBe(true);
  });

  it('joins its cycle at a random point, resting or travelling', () => {
    const { home } = setup(1);
    home.cycle = { settle: [10, 20], travel: [10, 20] };
    let resting = 0;
    let travelling = 0;
    for (let i = 0; i < 200; i++) {
      home.joinCycle();
      if (home.resting) resting++;
      else travelling++;
      expect(home.timer).toBeGreaterThanOrEqual(0);
      expect(home.timer).toBeLessThanOrEqual(20);
    }
    expect(resting).toBeGreaterThan(50);
    expect(travelling).toBeGreaterThan(50);
  });

  it('moves straight away when it joins its cycle travelling', () => {
    const { home } = setup(1);
    home.cycle = { settle: [10, 10], travel: [10, 10] };
    do home.joinCycle();
    while (home.resting || home.timer < 1);
    home.update(0.5);
    expect(home.moving).toBe(true);
    expect(Math.hypot(home.x, home.z)).toBeGreaterThan(0.4);
  });

  it('does not drift into the water', () => {
    const { world, home } = setup(2, 100);
    world.depth = (x) => (x > 5 ? 2 : 0);
    home.heading = Math.PI / 2;
    for (let i = 0; i < 2000; i++) {
      home.update(0.1);
      expect(home.x).toBeLessThanOrEqual(5);
    }
  });
});
