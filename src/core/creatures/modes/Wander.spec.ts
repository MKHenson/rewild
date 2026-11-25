import { MovementSettings, WanderSettings } from '../CreaturePresets';
import { Habitat, WaterHabitat } from '../Habitat';
import { MovementSystem } from '../MovementSystem';
import { TestAnimator, TestWorld } from '../testWorld';
import { STALL_TIME, Wander } from './Wander';

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

  it('waits without an action when blocked, then picks a new point', () => {
    const { animator, wander, system } = setup();
    system.update(0.05);
    const first = wander.targetX;
    system.blocked = true;
    wander.update(0.05, system);
    expect(wander.phase).toBe('wait');
    expect(animator.calls).toEqual([]);

    for (let i = 0; i < 30 && wander.phase === 'wait'; i++)
      wander.update(0.05, system);
    wander.update(0.05, system);
    expect(wander.phase).toBe('walk');
    expect(wander.targetX).not.toBe(first);
  });

  it('gives up a point it moves without getting closer to', () => {
    const { wander, system } = setup();
    system.update(0.05);
    for (let t = 0; t < STALL_TIME - 0.2; t += 0.05) {
      system.speed = 1;
      wander.update(0.05, system);
    }
    expect(wander.phase).toBe('walk');

    for (let t = 0; t < 0.5; t += 0.05) {
      system.speed = 1;
      wander.update(0.05, system);
    }
    expect(wander.phase).toBe('wait');
  });

  it('does not give up while turning on the spot', () => {
    const { wander, system } = setup();
    system.update(0.05);
    for (let t = 0; t < STALL_TIME * 2; t += 0.05) {
      system.speed = 0;
      wander.update(0.05, system);
    }
    expect(wander.phase).toBe('walk');
  });

  it('stays out of a moat between it and its point', () => {
    const moat: Habitat = { canBe: (x) => x < 11 || x > 12 };
    const { wander, system } = setup(() => 0.25, moat);
    system.update(0.05);
    expect(wander.targetX).toBeCloseTo(12.5);

    let waited = false;
    for (let t = 0; t < STALL_TIME + 5 && !waited; t += 0.05) {
      system.update(0.05);
      waited = wander.phase === 'wait';
      expect(system.x).toBeLessThan(11);
    }
    expect(waited).toBe(true);
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
    expect(copy.targetLevel).toBe(wander.targetLevel);
  });

  it('aims for a height it picks with each point', () => {
    const { wander, system } = setup();
    system.update(0.05);
    expect(system.goalLevel).toBe(wander.targetLevel);
    expect(wander.targetLevel).toBeGreaterThanOrEqual(0);
    expect(wander.targetLevel).toBeLessThanOrEqual(1);
  });

  describe('circling', () => {
    const CIRCLE: WanderSettings = {
      radius: 30,
      wait: [0, 0],
      actions: [],
      circle: true,
    };

    it('keeps going one way round home, near the radius', () => {
      const wander = new Wander(CIRCLE);
      const system = new MovementSystem(
        { ...SETTINGS, turnRate: 1, cruiseSpeed: 5, walkSpeed: 6 },
        { canBe: () => true },
        new TestWorld(),
        [wander],
        null,
        rolls(1)
      );
      system.place(0, 0, 0, 0);

      let travelled = 0;
      let last = Math.atan2(system.x, system.z);
      for (let t = 0; t < 120; t += 0.05) {
        system.update(0.05);
        const distance = Math.hypot(wander.targetX, wander.targetZ);
        expect(distance).toBeGreaterThanOrEqual(30 * 0.7);
        expect(distance).toBeLessThanOrEqual(30);

        if (Math.hypot(system.x, system.z) > 10) {
          const angle = Math.atan2(system.x, system.z);
          let step = angle - last;
          if (step > Math.PI) step -= Math.PI * 2;
          if (step < -Math.PI) step += Math.PI * 2;
          travelled += step;
          last = angle;
        } else last = Math.atan2(system.x, system.z);
      }

      expect(Math.abs(travelled)).toBeGreaterThan(Math.PI * 2);
    });

    it('never stops to wait', () => {
      const wander = new Wander(CIRCLE);
      const system = new MovementSystem(
        { ...SETTINGS, turnRate: 1, cruiseSpeed: 5, walkSpeed: 6 },
        { canBe: () => true },
        new TestWorld(),
        [wander],
        null,
        rolls(1)
      );
      system.place(0, 0, 0, 0);
      for (let t = 0; t < 3; t += 0.05) system.update(0.05);
      for (let t = 0; t < 60; t += 0.05) {
        system.update(0.05);
        expect(system.speed).toBeGreaterThanOrEqual(5);
      }
    });
  });
});

describe('Wander with hold', () => {
  const HOLD: WanderSettings = {
    radius: 5,
    wait: [6, 6],
    actions: [],
    hold: { drift: 1.5, every: [1, 1], speed: 0.3 },
  };

  function holding() {
    const wander = new Wander(HOLD);
    const system = new MovementSystem(
      SETTINGS,
      { canBe: () => true },
      new TestWorld(),
      [wander],
      null,
      rolls()
    );
    system.place(10, 0, 10, 0);
    for (let i = 0; i < 400 && wander.phase !== 'wait'; i++)
      system.update(0.05);
    return { wander, system };
  }

  it('drifts round the spot it waits at, and keeps near it', () => {
    const { wander, system } = holding();
    expect(wander.phase).toBe('wait');
    const spotX = wander.holdX;
    const spotZ = wander.holdZ;

    let farthest = 0;
    let moved = 0;
    let lastX = system.x;
    let lastZ = system.z;
    for (let i = 0; i < 100; i++) {
      system.update(0.05);
      farthest = Math.max(
        farthest,
        Math.hypot(system.x - spotX, system.z - spotZ)
      );
      moved += Math.hypot(system.x - lastX, system.z - lastZ);
      lastX = system.x;
      lastZ = system.z;
    }

    expect(wander.phase).toBe('wait');
    expect(moved).toBeGreaterThan(0.1);
    expect(farthest).toBeLessThan(HOLD.hold!.drift + 0.5);
  });

  it('moves on once the wait is over', () => {
    const { wander, system } = holding();
    for (let i = 0; i < 125; i++) system.update(0.05);

    expect(wander.phase).toBe('walk');
  });
});

describe('Wander at a slow walk', () => {
  it('reaches its point and acts, rather than giving it up', () => {
    const animator = new TestAnimator();
    const wander = new Wander({
      radius: 3,
      wait: [1, 1],
      actions: [{ meaning: 'feed', weight: 1 }],
    });
    const system = new MovementSystem(
      { ...SETTINGS, walkSpeed: 0.12, acceleration: 2 },
      { canBe: () => true },
      new TestWorld(),
      [wander],
      animator,
      rolls(0.99)
    );
    system.place(0, 0, 0, 0);
    for (let t = 0; t < 60; t += 0.05) system.update(0.05);
    expect(animator.calls).toContain('play feed');
  });
});

describe('Wander in deep water', () => {
  it('picks heights within its radius of where it swims', () => {
    const world = new TestWorld();
    world.height = () => -50;
    world.depth = () => 50;
    const habitat = new WaterHabitat(
      { type: 'water', bedMargin: 0.5, surfaceMargin: 0.5 },
      world
    );
    const wander = new Wander({ radius: 5, wait: [0, 0], actions: [] });
    const system = new MovementSystem(
      { ...SETTINGS, climbSpeed: 1 },
      habitat,
      world,
      [wander],
      null,
      rolls(0.99)
    );
    system.place(0, -25, 0, 0);
    for (let i = 0; i < 20; i++) {
      wander.phase = 'pick';
      system.update(0.05);
      const aim = -49.5 + wander.targetLevel * 49;
      expect(Math.abs(aim - system.y)).toBeLessThanOrEqual(5.01);
    }
  });
});
