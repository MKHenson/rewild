import { BiomeCreatures } from 'rewild-renderer';
import { AirHabitat, Habitat, LandHabitat, WaterHabitat } from './Habitat';
import {
  SPAWN_ID_PREFIX,
  SpawnBiome,
  SpawnSite,
  planChunkSpawns,
  spawnRandom,
} from './SpawnPlanner';
import { TestWorld } from './testWorld';

const SPAN = 200;

class TestSite implements SpawnSite {
  weights: Record<string, (x: number, z: number) => number> = {};
  habitats: Record<string, Habitat> = {};

  biomeWeight(name: string, x: number, z: number): number {
    return this.weights[name]?.(x, z) ?? 0;
  }

  habitat(creature: string): Habitat | null {
    return this.habitats[creature] ?? null;
  }
}

function setup(rules: BiomeCreatures[]) {
  const world = new TestWorld();
  const site = new TestSite();
  site.weights.plain = () => 1;
  site.habitats.chicken = new LandHabitat(
    { type: 'land', waterDepth: { from: 0.3, to: 0.2 } },
    world
  );
  const biomes: SpawnBiome[] = [{ name: 'plain', creatures: rules }];
  const plan = (cx = 0, cy = 0, seed = 1) =>
    planChunkSpawns(seed, cx, cy, SPAN, biomes, site, world);
  return { world, site, biomes, plan };
}

const CHICKENS: BiomeCreatures = {
  creature: 'chicken',
  density: 1,
  group: [2, 4],
  spread: 5,
};

describe('spawnRandom', () => {
  it('repeats for the same inputs and differs between chunks', () => {
    const a = spawnRandom(7, 1, 2, 3);
    const b = spawnRandom(7, 1, 2, 3);
    const c = spawnRandom(7, 2, 1, 3);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('planChunkSpawns', () => {
  it('plans the same creatures for the same chunk', () => {
    const { plan } = setup([CHICKENS]);
    expect(plan(3, -2)).toEqual(plan(3, -2));
    expect(plan(3, -2)).not.toEqual(plan(3, -1));
    expect(plan(3, -2, 1)).not.toEqual(plan(3, -2, 2));
  });

  it('spawns about the density for each hectare, in groups of the rule size', () => {
    const { plan } = setup([CHICKENS]);
    const groups = plan();
    expect(groups.length).toBe(4);
    for (const group of groups) {
      expect(group.members.length).toBeGreaterThanOrEqual(2);
      expect(group.members.length).toBeLessThanOrEqual(4);
    }
  });

  it('keeps each group inside the chunk and its animals round its home', () => {
    const { plan } = setup([CHICKENS]);
    for (const group of plan(2, 1)) {
      expect(group.homeX).toBeGreaterThanOrEqual(1.5 * SPAN);
      expect(group.homeX).toBeLessThan(2.5 * SPAN);
      expect(group.homeZ).toBeGreaterThanOrEqual(0.5 * SPAN);
      expect(group.homeZ).toBeLessThan(1.5 * SPAN);
      for (const m of group.members)
        expect(
          Math.hypot(m.x - group.homeX, m.z - group.homeZ)
        ).toBeLessThanOrEqual(5);
    }
  });

  it('gives each creature a stable id from its chunk and index', () => {
    const { plan } = setup([CHICKENS]);
    const ids = plan(3, -2).flatMap((g) => g.members.map((m) => m.id));
    expect(ids[0]).toBe(`${SPAWN_ID_PREFIX}3,-2:0`);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id, i) => expect(id).toBe(`${SPAWN_ID_PREFIX}3,-2:${i}`));
  });

  it('spawns nothing where the biome is absent', () => {
    const { site, plan } = setup([CHICKENS]);
    site.weights.plain = () => 0;
    expect(plan()).toEqual([]);
  });

  it('spawns only where the biome has weight', () => {
    const { site, plan } = setup([{ ...CHICKENS, density: 5 }]);
    site.weights.plain = (x) => (x < 0 ? 1 : 0);
    const groups = plan();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.homeX).toBeLessThan(0);
  });

  it('keeps land creatures out of deep water', () => {
    const { world, plan } = setup([{ ...CHICKENS, density: 5 }]);
    world.depth = (x) => (x > 0 ? 2 : 0);
    const groups = plan();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups)
      for (const m of group.members) expect(m.x).toBeLessThanOrEqual(0);
  });

  it('stands land creatures on the ground', () => {
    const { world, plan } = setup([CHICKENS]);
    world.height = (x) => 0.1 * x + 3;
    for (const group of plan())
      for (const m of group.members) expect(m.y).toBeCloseTo(0.1 * m.x + 3);
  });

  it('spawns fish only in water, between the bed and the surface', () => {
    const { world, site, biomes, plan } = setup([]);
    site.habitats.tuna = new WaterHabitat(
      { type: 'water', bedMargin: 0.5, surfaceMargin: 1 },
      world
    );
    biomes[0].creatures = [{ creature: 'tuna', density: 5 }];
    world.height = () => -6;
    world.depth = (x) => (x > 0 ? 6 : 0);

    const groups = plan();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups)
      for (const m of group.members) {
        expect(m.x).toBeGreaterThan(0);
        expect(m.y).toBeGreaterThanOrEqual(-5.5);
        expect(m.y).toBeLessThanOrEqual(-1);
      }
  });

  it('spawns birds inside their band', () => {
    const { world, site, biomes, plan } = setup([]);
    site.habitats.crow = new AirHabitat(
      { type: 'air', band: [15, 30], lookAhead: 3 },
      world
    );
    biomes[0].creatures = [{ creature: 'crow', density: 1 }];
    world.height = () => 10;

    const groups = plan();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups)
      for (const m of group.members) {
        expect(m.y).toBeGreaterThanOrEqual(25);
        expect(m.y).toBeLessThanOrEqual(40);
      }
  });

  it('skips rules whose creature has no habitat', () => {
    const { plan } = setup([{ ...CHICKENS, creature: 'dodo' }]);
    expect(plan()).toEqual([]);
  });

  it('keeps one rule in place when another is added', () => {
    const { biomes, site, world, plan } = setup([CHICKENS]);
    const before = plan();
    site.habitats.crow = new AirHabitat(
      { type: 'air', band: [15, 30], lookAhead: 3 },
      world
    );
    biomes[0].creatures = [CHICKENS, { creature: 'crow', density: 1 }];
    const after = plan().filter((g) => g.rule === CHICKENS);
    expect(after.map((g) => [g.homeX, g.homeZ])).toEqual(
      before.map((g) => [g.homeX, g.homeZ])
    );
  });
});
