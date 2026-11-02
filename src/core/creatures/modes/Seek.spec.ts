import { Vector3 } from 'rewild-common';
import { MovementSettings, SeekSettings } from '../CreaturePresets';
import { MovementSystem, PLAYER_ID } from '../MovementSystem';
import { TestAnimator, TestWorld } from '../testWorld';
import { Seek } from './Seek';
import { Wander } from './Wander';

const EVADE: SeekSettings = { radius: 5, release: 8, locomotion: 'flee' };
const SETTINGS: MovementSettings = {
  walkSpeed: 1,
  runSpeed: 3,
  turnRate: 6,
  acceleration: 6,
  modes: { evade: EVADE },
};

function setup(flee = true) {
  const world = new TestWorld();
  const animator = new TestAnimator();
  const seek = new Seek(flee ? 'evade' : 'seek', EVADE, flee);
  const wander = new Wander({
    radius: 2,
    wait: [100, 100],
    actions: [{ meaning: 'eat', weight: 1 }],
  });
  const system = new MovementSystem(
    SETTINGS,
    { canBe: () => true },
    world,
    [seek, wander],
    animator,
    () => 0.5
  );
  system.place(0, 0, 0, 0);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) system.update(0.05);
  };
  return { world, animator, seek, system, run };
}

describe('Seek as evade', () => {
  it('takes control inside its radius and holds it until the release radius', () => {
    const { world, system } = setup();
    world.player = new Vector3(0, 0, 6);
    system.update(0.05);
    expect(system.activeMode).toBe('wander');

    world.player.set(0, 0, 4);
    system.update(0.05);
    expect(system.activeMode).toBe('evade');

    world.player.set(system.x, 0, system.z + 7);
    system.update(0.05);
    expect(system.activeMode).toBe('evade');

    world.player.set(system.x, 0, system.z + 9);
    system.update(0.05);
    expect(system.activeMode).toBe('wander');
  });

  it('takes over from an eating wander, switches to the flee set, then back to normal', () => {
    const { world, animator, system, run } = setup();
    run(6);
    expect(animator.calls).toContain('play eat');

    world.player = new Vector3(system.x, 0, system.z + 2);
    system.update(0.05);
    expect(animator.calls.slice(-2)).toEqual(['stop eat', 'set flee']);

    world.player.set(100, 0, 100);
    system.update(0.05);
    expect(animator.locomotion).toBe('normal');
  });

  it('runs away from the player', () => {
    const { world, system, run } = setup();
    world.player = new Vector3(0, 0, 3);
    run(2);

    expect(system.z).toBeLessThan(-1);
    expect(system.speed).toBeGreaterThan(1);
  });

  it('saves the player as an id', () => {
    const { world, seek, system } = setup();
    world.player = new Vector3(0, 0, 3);
    system.update(0.05);

    expect(seek.serialize()).toEqual({ target: PLAYER_ID, engaged: true });
    const copy = new Seek('evade', EVADE, true);
    copy.restore(seek.serialize());
    expect(copy.engaged).toBe(true);
  });
});

describe('Seek as chase', () => {
  it('runs toward the player', () => {
    const { world, system, run } = setup(false);
    world.player = new Vector3(0, 0, 4);
    run(1);

    expect(system.z).toBeGreaterThan(1);
  });
});
