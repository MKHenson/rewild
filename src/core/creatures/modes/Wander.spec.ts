import { MovementSettings, WanderSettings } from '../CreaturePresets';
import { Habitat } from '../Habitat';
import { MovementSystem } from '../MovementSystem';
import { TestAnimator, TestWorld } from '../testWorld';
import { Wander } from './Wander';

const WANDER: WanderSettings = {
  radius: 5,
  wait: [1, 1],
  actions: [
    { meaning: 'eat', weight: 1 },
    { meaning: null, weight: 1 },
  ],
};
const SETTINGS: MovementSettings = {
  walkSpeed: 1,
  runSpeed: 3,
  turnRate: 6,
  acceleration: 6,
  modes: { wander: WANDER },
};

/** Cycles through rolls under `ceiling`, so points differ but rolls stay low. */
function rolls(ceiling = 0.5) {
  let roll = 0;
  return () => (roll = (roll + 0.37) % 1) * ceiling;
}

function setup(random = rolls(), habitat: Habitat = { canBe: () => true }) {
  const animator = new TestAnimator();
  const wander = new Wander(WANDER);
  const system = new MovementSystem(
    SETTINGS,
    habitat,
    new TestWorld(),
    [wander],
    animator,
    random
  );
  system.place(10, 0, 10, 0);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) system.update(0.05);
  };
  return { animator, wander, system, run };
}

describe('Wander', () => {
  it('walks to a point near home, then waits there', () => {
    const { wander, system, run } = setup();
    system.update(0.05);
    expect(wander.phase).toBe('walk');
    expect(Math.hypot(wander.targetX - 10, wander.targetZ - 10)).toBeLessThan(
      5
    );

    run(15);
    expect(['wait', 'walk']).toContain(wander.phase);
    expect(Math.hypot(system.x - 10, system.z - 10)).toBeLessThan(5.5);
  });

  it('plays the picked action while it waits, and stops it when it moves on', () => {
    const { animator, wander, system } = setup();
    system.update(0.05);
    for (let i = 0; i < 400 && wander.phase !== 'wait'; i++)
      system.update(0.05);
    expect(animator.calls).toEqual(['play eat']);

    for (let i = 0; i < 30; i++) system.update(0.05);
    expect(animator.calls).toEqual(['play eat', 'stop eat']);
    expect(wander.phase).toBe('walk');
  });

  it('stands in idle when it picks no action', () => {
    const { animator, wander, system } = setup(() => 0.9);
    for (let i = 0; i < 400 && wander.phase !== 'wait'; i++)
      system.update(0.05);
    expect(wander.phase).toBe('wait');
    expect(animator.calls).toEqual([]);
  });

  it('picks a new point when blocked', () => {
    const { wander, system } = setup();
    system.update(0.05);
    const first = wander.targetX;
    system.blocked = true;
    wander.update(0.05, system);

    expect(wander.phase).toBe('walk');
    expect(wander.targetX).not.toBe(first);
  });

  it('waits when no point near home is inside the habitat', () => {
    const { wander, system } = setup(rolls(), {
      canBe: (x, z) => x === 10 && z === 10,
    });
    system.update(0.05);
    expect(wander.phase).toBe('wait');
  });

  it('survives serialize then restore', () => {
    const { wander, system } = setup();
    system.update(0.05);
    const copy = new Wander(WANDER);
    copy.restore(wander.serialize());

    expect(copy.phase).toBe(wander.phase);
    expect(copy.targetX).toBe(wander.targetX);
    expect(copy.targetZ).toBe(wander.targetZ);
  });
});
