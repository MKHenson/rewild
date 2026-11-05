import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { BehaviourState } from 'rewild-routing';
import { MovementSettings } from './CreaturePresets';
import { AirHabitat, Habitat, WaterHabitat } from './Habitat';
import { IMovementMode, MovementSystem } from './MovementSystem';
import { TestAnimator, TestWorld } from './testWorld';

const SETTINGS: MovementSettings = {
  walkSpeed: 1,
  runSpeed: 3,
  turnRate: 4,
  acceleration: 6,
  modes: {},
};

class GoalMode implements IMovementMode {
  wants = 1;
  goalX = 0;
  goalZ = 0;
  speed = 1;
  entered = 0;
  exited = 0;
  state: BehaviourState = {};

  constructor(readonly name: string) {}

  score(): number {
    return this.wants;
  }
  enter(): void {
    this.entered++;
  }
  exit(): void {
    this.exited++;
  }
  update(_dt: number, system: MovementSystem): void {
    system.steerTo(this.goalX, this.goalZ, this.speed);
  }
  serialize(): BehaviourState {
    return { goalX: this.goalX };
  }
  restore(state: BehaviourState): void {
    this.state = state;
  }
}

const anywhere: Habitat = { canBe: () => true };

function setup(habitat: Habitat = anywhere, modes = [new GoalMode('a')]) {
  const world = new TestWorld();
  const system = new MovementSystem(SETTINGS, habitat, world, modes);
  system.place(0, 0, 0, 0);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) system.update(0.05);
  };
  return { world, system, modes, run };
}

describe('MovementSystem', () => {
  it('gives control to the top-scoring mode, entering and exiting once', () => {
    const low = new GoalMode('low');
    const high = new GoalMode('high');
    high.wants = 0;
    const { system } = setup(anywhere, [low, high]);

    system.update(0.05);
    system.update(0.05);
    expect(system.activeMode).toBe('low');
    expect(low.entered).toBe(1);

    high.wants = 2;
    system.update(0.05);
    system.update(0.05);
    expect(system.activeMode).toBe('high');
    expect(low.exited).toBe(1);
    expect(high.entered).toBe(1);
  });

  it('walks to the goal and stops there', () => {
    const { system, modes, run } = setup();
    modes[0].goalX = 4;
    modes[0].goalZ = 3;
    run(10);

    expect(system.arrived).toBe(true);
    expect(Math.hypot(system.x - 4, system.z - 3)).toBeLessThan(0.35);
    expect(system.speed).toBe(0);
  });

  it('follows the ground height', () => {
    const { world, system, modes, run } = setup();
    world.height = (x) => x * 0.5;
    modes[0].goalX = 4;
    run(10);

    expect(system.y).toBeCloseTo(system.x * 0.5);
  });

  it('turns along the shore instead of walking into the water', () => {
    const shore: Habitat = { canBe: (_x, z) => z < 5 };
    const { system, modes, run } = setup(shore);
    modes[0].goalX = 2;
    modes[0].goalZ = 20;
    modes[0].speed = 3;
    run(6);

    expect(system.z).toBeLessThan(5);
    expect(Math.abs(system.x)).toBeGreaterThan(1);
    expect(system.blocked).toBe(false);
  });

  it('stops and reports blocked when no direction is inside the habitat', () => {
    const island: Habitat = { canBe: (x, z) => Math.hypot(x, z) < 1e-3 };
    const { system, modes, run } = setup(island);
    modes[0].goalZ = 5;
    run(1);

    expect(system.blocked).toBe(true);
    expect(system.speed).toBe(0);
    expect(system.z).toBe(0);
  });

  it('walks freely back into its habitat from outside it', () => {
    const shore: Habitat = { canBe: (_x, z) => z < 5 };
    const { system, modes, run } = setup(shore);
    system.place(0, 0, 8, Math.PI);
    modes[0].goalZ = 0;
    run(10);

    expect(system.z).toBeLessThan(5);
  });

  it('survives serialize then restore', () => {
    const { system, modes, run } = setup();
    modes[0].goalX = 3;
    run(1);
    const copy = setup();
    copy.system.restore(system.serialize());

    expect(copy.system.x).toBeCloseTo(system.x);
    expect(copy.system.heading).toBeCloseTo(system.heading);
    expect(copy.system.activeMode).toBe('a');
    expect(copy.modes[0].state).toEqual({ goalX: 3 });
  });

  it('falls to the ground from a height, and snaps on small steps', () => {
    const { world, system, run } = setup();
    world.height = () => 0;
    system.place(0, 20, 0, 0);
    system.update(0.05);
    expect(system.y).toBeGreaterThan(19);
    expect(system.y).toBeLessThan(20);

    run(5);
    expect(system.y).toBe(0);
  });
});

describe('MovementSystem in the wrong medium', () => {
  const lakeAtPositiveZ = (world: TestWorld) => {
    world.depth = (_x, z) => (z > 0 ? 5 : 0);
  };

  function stranded(habitat: (world: TestWorld) => Habitat) {
    const world = new TestWorld();
    lakeAtPositiveZ(world);
    const mode = new GoalMode('a');
    mode.goalX = 10;
    const animator = new TestAnimator();
    const system = new MovementSystem(
      SETTINGS,
      habitat(world),
      world,
      [mode],
      animator
    );
    return { world, mode, system };
  }

  it('falls to the ground and stays still, then recovers in habitat', () => {
    const { world, mode, system } = stranded(
      (w) =>
        new WaterHabitat(
          { type: 'water', bedMargin: 0.5, surfaceMargin: 0.5 },
          w
        )
    );
    system.place(0, 4, -5, 0);
    for (let t = 0; t < 5; t += 0.05) system.update(0.05);

    expect(system.stranded).toBe(true);
    expect(system.activeMode).toBeNull();
    expect(system.y).toBe(0);
    expect(system.x).toBe(0);
    expect(system.z).toBe(-5);
    expect(system.speed).toBe(0);
    expect(mode.entered).toBe(0);

    world.depth = () => 5;
    system.update(0.05);
    expect(system.stranded).toBe(false);
    expect(system.activeMode).toBe('a');
    expect(mode.entered).toBe(1);
  });

  it('stops the active mode when it becomes stranded', () => {
    const { world, mode, system } = stranded(
      (w) =>
        new WaterHabitat(
          { type: 'water', bedMargin: 0.5, surfaceMargin: 0.5 },
          w
        )
    );
    system.place(0, 2, 5, 0);
    system.update(0.05);
    expect(system.activeMode).toBe('a');

    world.depth = () => 0;
    system.update(0.05);
    expect(system.activeMode).toBeNull();
    expect(mode.exited).toBe(1);
  });
});

describe('MovementSystem swimming', () => {
  const SWIM: MovementSettings = {
    walkSpeed: 1,
    runSpeed: 2,
    turnRate: 2,
    acceleration: 2,
    cruiseSpeed: 0.5,
    climbSpeed: 0.5,
    modes: {},
  };

  function swimmer() {
    const world = new TestWorld();
    world.height = () => -6;
    world.depth = () => 6;
    const habitat = new WaterHabitat(
      { type: 'water', bedMargin: 0.5, surfaceMargin: 0.5 },
      world
    );
    const mode = new GoalMode('a');
    const system = new MovementSystem(SWIM, habitat, world, [mode]);
    return { world, mode, system };
  }

  it('moves to the height it aims for', () => {
    const { mode, system } = swimmer();
    system.place(0, -3, 0, 0);
    mode.goalZ = 200;
    system.goalLevel = 1;
    for (let t = 0; t < 30; t += 0.05) system.update(0.05);
    expect(system.y).toBeCloseTo(-0.5, 1);

    system.goalLevel = 0;
    for (let t = 0; t < 30; t += 0.05) system.update(0.05);
    expect(system.y).toBeCloseTo(-5.5, 1);
  });

  it('stays between the bed and the surface as the bed rises', () => {
    const { world, mode, system } = swimmer();
    world.height = (_x, z) => -6 + z * 0.2;
    world.depth = (_x, z) => 6 - z * 0.2;
    system.place(0, -5.4, 0, 0);
    mode.goalZ = 200;
    system.goalLevel = 0;
    for (let t = 0; t < 40; t += 0.05) {
      system.update(0.05);
      expect(system.y).toBeGreaterThanOrEqual(-6 + system.z * 0.2);
      expect(system.y).toBeLessThanOrEqual(-0.5);
    }
  });

  it('falls into the water from above the surface', () => {
    const { system } = swimmer();
    system.place(0, 5, 0, 0);
    system.update(0.05);
    expect(system.y).toBeLessThan(5);
    for (let t = 0; t < 3; t += 0.05) system.update(0.05);
    expect(system.y).toBeLessThanOrEqual(-0.5);
  });

  it('never stops while it can move', () => {
    const { mode, system } = swimmer();
    system.place(0, -3, 0, 0);
    mode.speed = 0;
    for (let t = 0; t < 2; t += 0.05) system.update(0.05);
    expect(system.speed).toBeCloseTo(0.5);
    expect(system.z).toBeGreaterThan(0);
  });

  it('turns back at the shore', () => {
    const { world, mode, system } = swimmer();
    world.depth = (_x, z) => (z < 5 ? 6 : 0);
    system.place(0, -3, 0, 0);
    mode.goalZ = 50;
    for (let t = 0; t < 30; t += 0.05) {
      system.update(0.05);
      expect(system.z).toBeLessThan(5);
    }
    expect(system.stranded).toBe(false);
  });
});

describe('MovementSystem flying', () => {
  const FLY: MovementSettings = {
    walkSpeed: 6,
    runSpeed: 9,
    turnRate: 1,
    acceleration: 4,
    cruiseSpeed: 5,
    climbSpeed: 3,
    bank: 0.5,
    modes: {},
  };

  function flier() {
    const world = new TestWorld();
    const habitat = new AirHabitat(
      { type: 'air', band: [10, 20], lookAhead: 3 },
      world
    );
    const mode = new GoalMode('a');
    const system = new MovementSystem(FLY, habitat, world, [mode]);
    return { world, mode, system };
  }

  it('rises off the ground into its band and does not fall', () => {
    const { mode, system } = flier();
    system.place(0, 0, 0, 0);
    mode.goalZ = 1000;
    mode.speed = 6;
    for (let t = 0; t < 20; t += 0.05) system.update(0.05);

    expect(system.y).toBeGreaterThan(10);
    expect(system.y).toBeLessThan(20);
    expect(system.climb).toBeGreaterThanOrEqual(0);
  });

  it('climbs before a hill, and stays above it', () => {
    const { world, mode, system } = flier();
    const hill = (z: number) => Math.max(0, Math.min(30, (z - 100) * 0.5));
    world.height = (_x, z) => hill(z);
    system.place(0, 15, 0, 0);
    mode.goalZ = 1000;
    mode.speed = 6;

    let heightAtFoot = 0;
    for (let t = 0; t < 60; t += 0.05) {
      system.update(0.05);
      if (system.z < 100) heightAtFoot = system.y;
      expect(system.y).toBeGreaterThanOrEqual(hill(system.z));
    }
    expect(heightAtFoot).toBeGreaterThan(16);
    expect(system.y).toBeGreaterThan(40);
    expect(system.y).toBeLessThan(50);
  });

  it('flies over water at its band above the surface', () => {
    const { world, mode, system } = flier();
    world.height = () => -10;
    world.depth = () => 10;
    system.place(0, 15, 0, 0);
    mode.goalZ = 1000;
    for (let t = 0; t < 20; t += 0.05) system.update(0.05);

    expect(system.stranded).toBe(false);
    expect(system.y).toBeGreaterThan(10);
    expect(system.y).toBeLessThan(20);
  });

  it('rolls its top into the turn, and levels out', () => {
    const { mode, system } = flier();
    system.place(0, 15, 0, 0);
    mode.goalX = 500;
    mode.goalZ = 0;
    for (let t = 0; t < 1; t += 0.05) system.update(0.05);
    expect(system.roll).toBeLessThan(-0.1);

    const transform = new Transform();
    system.applyTo(transform);
    transform.updateMatrix();
    const up = new Vector3(0, 1, 0).applyQuaternion(transform.quaternion);
    expect(up.x).toBeGreaterThan(0.1);

    for (let t = 0; t < 10; t += 0.05) system.update(0.05);
    expect(Math.abs(system.roll)).toBeLessThan(0.02);
  });
});
