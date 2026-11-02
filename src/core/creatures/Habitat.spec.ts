import { LandHabitatSettings } from './CreaturePresets';
import { LandHabitat, createHabitat } from './Habitat';
import { TestWorld } from './testWorld';

const LAND: LandHabitatSettings = {
  type: 'land',
  slope: { from: 35, to: 30 },
  waterDepth: { from: 0.3, to: 0.2 },
};

function setup() {
  const world = new TestWorld();
  return { world, habitat: new LandHabitat(LAND, world) };
}

describe('LandHabitat', () => {
  it('accepts dry, flat ground', () => {
    expect(setup().habitat.canBe(0, 0)).toBe(true);
  });

  it('accepts wading depth and rejects deep water', () => {
    const { world, habitat } = setup();
    world.depth = () => 0.1;
    expect(habitat.canBe(0, 0)).toBe(true);
    world.depth = () => 1;
    expect(habitat.canBe(0, 0)).toBe(false);
  });

  it('rejects a steep slope', () => {
    const { world, habitat } = setup();
    world.height = (x) => x * 0.2;
    expect(habitat.canBe(0, 0)).toBe(true);
    world.height = (x) => x;
    expect(habitat.canBe(0, 0)).toBe(false);
  });

  it('rejects ground that is not loaded', () => {
    const { world, habitat } = setup();
    world.height = () => null;
    expect(habitat.canBe(0, 0)).toBe(false);
  });
});

describe('createHabitat', () => {
  it('takes exactly one habitat', () => {
    const world = new TestWorld();
    expect(() => createHabitat([], world)).toThrow();
    expect(() => createHabitat([LAND, LAND], world)).toThrow();
    expect(createHabitat([LAND], world)).toBeInstanceOf(LandHabitat);
  });
});
