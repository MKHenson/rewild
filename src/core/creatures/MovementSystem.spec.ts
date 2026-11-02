import { BehaviourState } from 'rewild-routing';
import { MovementSettings } from './CreaturePresets';
import { Habitat } from './Habitat';
import { IMovementMode, MovementSystem } from './MovementSystem';
import { TestWorld } from './testWorld';

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
});
