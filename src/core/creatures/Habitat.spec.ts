import {
  AirHabitatSettings,
  LandHabitatSettings,
  WaterHabitatSettings,
} from './CreaturePresets';
import {
  AirHabitat,
  HeightRange,
  LandHabitat,
  WaterHabitat,
  createHabitat,
} from './Habitat';
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

  it('is stranded in deep water, and not on a steep slope', () => {
    const { world, habitat } = setup();
    world.height = (x) => x;
    expect(habitat.canBe(0, 0)).toBe(false);
    expect(habitat.stranded(0, 0)).toBe(false);

    world.height = () => 0;
    world.depth = () => 1;
    expect(habitat.stranded(0, 0)).toBe(true);
  });
});

describe('WaterHabitat', () => {
  const WATER: WaterHabitatSettings = {
    type: 'water',
    bedMargin: 0.5,
    surfaceMargin: 0.5,
  };
  const range: HeightRange = { min: 0, max: 0 };

  it('ranges from above the bed to below the surface', () => {
    const world = new TestWorld();
    world.height = () => -5;
    world.depth = () => 4;
    const habitat = new WaterHabitat(WATER, world);

    expect(habitat.canBe(0, 0)).toBe(true);
    expect(habitat.heightRange(0, 0, range)).toBe(true);
    expect(range.min).toBeCloseTo(-4.5);
    expect(range.max).toBeCloseTo(-1.5);
  });

  it('is stranded on land and in water too shallow for its margins', () => {
    const world = new TestWorld();
    const habitat = new WaterHabitat(WATER, world);
    expect(habitat.stranded(0, 0)).toBe(true);

    world.depth = () => 0.8;
    expect(habitat.canBe(0, 0)).toBe(false);
    expect(habitat.stranded(0, 0)).toBe(true);
  });

  it('is neither valid nor stranded where the ground is not loaded', () => {
    const world = new TestWorld();
    world.height = () => null;
    const habitat = new WaterHabitat(WATER, world);
    expect(habitat.canBe(0, 0)).toBe(false);
    expect(habitat.stranded(0, 0)).toBe(false);
  });

  it('keeps to its allowed water types', () => {
    const world = new TestWorld();
    world.depth = () => 4;
    world.palette = ['lake', 'ocean'];

    const lake: WaterHabitatSettings = { ...WATER, waterTypes: ['lake'] };
    const ocean: WaterHabitatSettings = { ...WATER, waterTypes: ['ocean'] };
    expect(new WaterHabitat(lake, world).canBe(0, 0)).toBe(true);
    expect(new WaterHabitat(ocean, world).canBe(0, 0)).toBe(false);

    world.palette = ['lake'];
    expect(new WaterHabitat(ocean, world).canBe(0, 0)).toBe(false);
  });
});

describe('AirHabitat', () => {
  const AIR: AirHabitatSettings = { type: 'air', band: [10, 20], lookAhead: 2 };
  const range: HeightRange = { min: 0, max: 0 };

  it('bands above the ground', () => {
    const world = new TestWorld();
    world.height = () => 5;
    expect(new AirHabitat(AIR, world).heightRange(0, 0, range)).toBe(true);
    expect(range.min).toBe(15);
    expect(range.max).toBe(25);
  });

  it('bands above the water where there is water', () => {
    const world = new TestWorld();
    world.height = () => 5;
    world.depth = () => 3;
    new AirHabitat(AIR, world).heightRange(0, 0, range);
    expect(range.min).toBe(18);
    expect(range.max).toBe(28);
  });

  it('is never stranded, and rejects ground that is not loaded', () => {
    const world = new TestWorld();
    const habitat = new AirHabitat(AIR, world);
    expect(habitat.canBe(0, 0)).toBe(true);
    expect('stranded' in habitat).toBe(false);

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

  it('builds each habitat type', () => {
    const world = new TestWorld();
    expect(
      createHabitat([{ type: 'water', bedMargin: 0, surfaceMargin: 0 }], world)
    ).toBeInstanceOf(WaterHabitat);
    expect(
      createHabitat([{ type: 'air', band: [1, 2], lookAhead: 1 }], world)
    ).toBeInstanceOf(AirHabitat);
  });
});
