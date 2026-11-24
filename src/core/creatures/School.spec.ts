import { Vector3 } from 'rewild-common';
import { WaterHabitat } from './Habitat';
import { HerdHome } from './HerdHome';
import { School } from './School';
import { SCHOOL_FISH_PRESETS } from './SchoolFishPresets';
import { GAIT_ESCAPE } from './SwimGaits';
import { ThreatField } from './Threats';
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
      phases.add(Math.round(school.gaits.phase[i] * 100));
    expect(phases.size).toBeGreaterThan(10);
    for (let i = 0; i < school.count; i++)
      expect(school.gaits.amplitude[i]).toBeGreaterThan(0);
  });

  it('snaps members into an escape as they first feel a threat', () => {
    const { world, school } = setup(40);
    run(school, 3);
    world.player = new Vector3(school.px[0], school.py[0], school.pz[0]);
    school.update(1 / 30);
    let escaping = 0;
    for (let i = 0; i < school.count; i++)
      if (school.gaits.gait[i] === GAIT_ESCAPE) escaping++;
    expect(escaping).toBe(school.threatened);
    expect(escaping).toBeGreaterThan(0);
  });

  it('flees a threat by its fright, and ignores one too far for it', () => {
    const { world, school } = setup(40);
    run(school, 3);
    const threats = new ThreatField();
    world.threats = threats;
    const at = new Vector3(school.px[0], school.py[0], school.pz[0] - 6);
    let fright = 1;
    threats.add({
      get fright() {
        return fright;
      },
      position: (out) => {
        out.copy(at);
        return true;
      },
    });
    run(school, 0.2);
    expect(school.state).toBe('cruise');
    fright = 3;
    run(school, 0.2);
    expect(school.state).toBe('evade');
  });

  it('moves as one point while far and unseen, then settles', () => {
    const { school } = setup(40, 1);
    run(school, 1);
    const x = school.px[5];
    const z = school.pz[5];
    const homeX = school.home.x;
    const homeZ = school.home.z;
    for (let t = 0; t < 2; t += 1 / 30) school.update(1 / 30, false);
    expect(school.asPoint).toBe(true);
    expect(school.px[5]).toBe(x);
    expect(school.pz[5]).toBe(z);
    expect(school.offsetX).toBeCloseTo(school.home.x - homeX, 5);
    expect(school.offsetZ).toBeCloseTo(school.home.z - homeZ, 5);
    const offsetX = school.offsetX;
    school.settle();
    expect(school.px[5]).toBeCloseTo(x + offsetX, 5);
    expect(school.offsetX).toBe(0);
  });

  it('swims member by member while unseen but near the player', () => {
    const { world, school } = setup(40);
    run(school, 1);
    world.player = new Vector3(20, -4, 20);
    const x = school.px[5];
    school.update(1 / 30, false);
    expect(school.asPoint).toBe(false);
    expect(school.px[5]).not.toBe(x);
  });

  it('brings a member stranded on dry ground back toward home', () => {
    const { school } = setup(10);
    run(school, 1);
    school.px[0] = 40;
    school.pz[0] = 0;
    run(school, 10);
    expect(school.px[0]).toBeLessThan(30);
  });

  it('spawns no members where its home has no water', () => {
    const { world, school } = setup();
    world.depth = () => 0;
    school.update(1 / 30);
    expect(school.count).toBe(0);
    expect(() => run(school, 1)).not.toThrow();
  });
});
