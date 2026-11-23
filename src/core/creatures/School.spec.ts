import { Vector3 } from 'rewild-common';
import { WaterHabitat } from './Habitat';
import { HerdHome } from './HerdHome';
import { School } from './School';
import { SCHOOL_FISH_PRESETS } from './SchoolFishPresets';
import { TestWorld } from './testWorld';

const SARDINE = SCHOOL_FISH_PRESETS.sardine;

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function setup(size = 60, drift = 0) {
  const world = new TestWorld();
  world.palette = ['ocean'];
  world.height = () => -8;
  world.depth = (x) => (x < 30 ? 8 : 0);
  world.shore = () => 100;
  const habitat = new WaterHabitat(SARDINE.habitat, world);
  const random = seeded();
  const home = new HerdHome(0, 0, 0, drift, 40, habitat, random);
  const school = new School(
    SARDINE.steering,
    SARDINE.swim,
    0.2,
    habitat,
    world,
    home,
    size,
    3,
    random
  );
  return { world, school };
}

function run(school: School, seconds: number, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) school.update(dt);
}

function nearestGaps(school: School): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < school.count; i++) {
    let best = Infinity;
    for (let j = 0; j < school.count; j++) {
      if (i === j) continue;
      best = Math.min(
        best,
        Math.hypot(
          school.px[i] - school.px[j],
          school.py[i] - school.py[j],
          school.pz[i] - school.pz[j]
        )
      );
    }
    gaps.push(best);
  }
  return gaps;
}

describe('School', () => {
  it('waits for the water at its home to load', () => {
    const { world, school } = setup();
    world.height = () => null;
    run(school, 1);
    expect(school.state).toBe('waiting');
    expect(school.count).toBe(0);
    world.height = () => -8;
    school.update(1 / 30);
    expect(school.count).toBe(60);
  });

  it('spawns every member inside its spread and swim band', () => {
    const { school } = setup();
    school.update(1 / 30);
    for (let i = 0; i < school.count; i++) {
      expect(Math.hypot(school.px[i], school.pz[i])).toBeLessThan(3.1);
      expect(school.py[i]).toBeGreaterThanOrEqual(-8 + 0.5);
      expect(school.py[i]).toBeLessThanOrEqual(-0.5);
    }
  });

  it('keeps its members in the water and their band', () => {
    const { school } = setup(80, 1);
    for (let step = 0; step < 450; step++) {
      school.update(1 / 30);
      for (let i = 0; i < school.count; i++) {
        expect(school.px[i]).toBeLessThan(30);
        expect(school.py[i]).toBeGreaterThanOrEqual(-7.5 - 1e-6);
        expect(school.py[i]).toBeLessThanOrEqual(-0.5 + 1e-6);
      }
    }
  });

  it('keeps members apart', () => {
    const { school } = setup(80);
    run(school, 10);
    const gaps = nearestGaps(school);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.min(...gaps)).toBeGreaterThan(0.05);
    expect(mean).toBeGreaterThan(SARDINE.steering.spacing * 0.5);
  });

  it('swims as one, heading the same way', () => {
    const { school } = setup(80);
    run(school, 10);
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < school.count; i++) {
      const speed = Math.hypot(school.vx[i], school.vz[i]);
      sx += school.vx[i] / speed;
      sz += school.vz[i] / speed;
    }
    expect(Math.hypot(sx, sz) / school.count).toBeGreaterThan(0.8);
  });

  it('stays together near its home', () => {
    const { school } = setup(80);
    run(school, 30);
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < school.count; i++) {
      cx += school.px[i];
      cz += school.pz[i];
    }
    expect(
      Math.hypot(cx / school.count, cz / school.count)
    ).toBeLessThan(SARDINE.steering.homeRadius * 2);
  });

  it('parts round the player', () => {
    const { world, school } = setup(80);
    run(school, 5);
    const centre = new Vector3();
    for (let i = 0; i < school.count; i++)
      centre.x += school.px[i] / school.count;
    for (let i = 0; i < school.count; i++)
      centre.y += school.py[i] / school.count;
    for (let i = 0; i < school.count; i++)
      centre.z += school.pz[i] / school.count;
    world.player = centre;
    run(school, 0.2);
    expect(school.state).toBe('evade');
    run(school, 3);
    const gaps: number[] = [];
    for (let i = 0; i < school.count; i++)
      gaps.push(
        Math.hypot(
          school.px[i] - centre.x,
          school.py[i] - centre.y,
          school.pz[i] - centre.z
        )
      );
    expect(Math.min(...gaps)).toBeGreaterThan(1);
  });

  it('beats its tails at their own phases', () => {
    const { school } = setup(20);
    run(school, 2);
    const phases = new Set<number>();
    for (let i = 0; i < school.count; i++)
      phases.add(Math.round(school.phase[i] * 100));
    expect(phases.size).toBeGreaterThan(10);
    for (let i = 0; i < school.count; i++)
      expect(school.amplitude[i]).toBeGreaterThan(0);
  });

  it('spawns no members where its home has no water', () => {
    const { world, school } = setup();
    world.depth = () => 0;
    school.update(1 / 30);
    expect(school.count).toBe(0);
    expect(() => run(school, 1)).not.toThrow();
  });
});
