import { CREATURE_PRESETS } from '../CreaturePresets';
import { CreatureGroup } from '../CreatureGroup';
import { WaterHabitat } from '../Habitat';
import { MovementSystem } from '../MovementSystem';
import { TestWorld } from '../testWorld';
import { Shoal } from './Shoal';
import { Wander } from './Wander';

const TUNA = CREATURE_PRESETS.tuna;
const DT = 1 / 30;

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function setup(count = 5, speed = 1) {
  const world = new TestWorld();
  world.palette = ['ocean'];
  world.height = () => -20;
  world.depth = () => 20;
  world.shore = () => 200;
  const group = new CreatureGroup();
  group.speed = speed;
  const members: MovementSystem[] = [];
  for (let i = 0; i < count; i++) {
    const system = new MovementSystem(
      TUNA.movement,
      new WaterHabitat(TUNA.habitat[0] as never, world),
      world,
      [
        new Shoal(TUNA.movement.modes.shoal!),
        new Wander(TUNA.movement.modes.wander!),
      ],
      null,
      seeded(i * 7919 + 13)
    );
    system.place((i % 3) * 4 - 4, -10, Math.floor(i / 3) * 4, i * 1.3);
    group.join(system);
    members.push(system);
  }
  // The home heads along +X.
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      group.homeX += group.speed * DT;
      for (const m of members) {
        m.homeX = group.homeX;
        m.homeZ = group.homeZ;
        m.update(DT);
      }
    }
  };
  return { group, members, run };
}

function alignment(members: MovementSystem[]): number {
  let x = 0;
  let z = 0;
  for (const m of members) {
    x += Math.sin(m.heading);
    z += Math.cos(m.heading);
  }
  return Math.hypot(x, z) / members.length;
}

describe('Shoal', () => {
  it('takes over while the home moves', () => {
    const { members, run } = setup();
    run(0.1);
    for (const m of members) expect(m.activeMode).toBe('shoal');
  });

  it('leaves the creatures to wander while the home stays put', () => {
    const { members, run } = setup(5, 0);
    run(0.1);
    for (const m of members) expect(m.activeMode).toBe('wander');
  });

  it('does not shoal alone', () => {
    const { members, run } = setup(1);
    run(0.1);
    expect(members[0].activeMode).toBe('wander');
  });

  it('turns the group to travel one way, with its home', () => {
    const { group, members, run } = setup();
    expect(alignment(members)).toBeLessThan(0.7);
    run(30);
    expect(alignment(members)).toBeGreaterThan(0.85);
    let x = 0;
    for (const m of members) x += m.x / members.length;
    expect(x).toBeGreaterThan(20);
    for (const m of members)
      expect(Math.hypot(m.x - group.homeX, m.z - group.homeZ)).toBeLessThan(
        25
      );
  });

  it('keeps group mates apart', () => {
    const { members, run } = setup();
    run(30);
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        expect(
          Math.hypot(
            members[i].x - members[j].x,
            members[i].z - members[j].z
          )
        ).toBeGreaterThan(0.5);
  });

  it('swims about the group level, each at its own depth', () => {
    const { group, members, run } = setup();
    group.level = 0.6;
    run(0.1);
    const levels = new Set<number>();
    for (const m of members) {
      expect(Math.abs(m.goalLevel - 0.6)).toBeLessThan(0.3);
      levels.add(Math.round(m.goalLevel * 1000));
    }
    expect(levels.size).toBe(members.length);
  });
});
