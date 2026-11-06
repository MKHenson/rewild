import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { LookAtSettings } from './CreaturePresets';
import { HeadLook, LookTarget } from './HeadLook';
import { TestWorld } from './testWorld';

const SETTINGS: LookAtSettings = {
  radius: 10,
  yawLimit: 1.5,
  pitchLimit: 0.8,
  smoothing: 0.1,
};
const DT = 1 / 60;

function setup() {
  const world = new TestWorld();
  const transform = new Transform();
  const set = { yaw: 0, pitch: 0, weight: -1 };
  const target: LookTarget = {
    lookOrigin: new Vector3(0, 0.5, 0.2),
    setLook: (yaw, pitch, weight) => {
      set.yaw = yaw;
      set.pitch = pitch;
      set.weight = weight;
    },
  };
  const look = new HeadLook(SETTINGS, target, transform, world);
  const place = (x: number, z: number, heading: number) => {
    transform.position.set(x, 0, z);
    transform.rotation.set(0, heading, 0, transform.rotation.order);
    transform.updateMatrixWorld();
  };
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) look.update(DT);
  };
  place(0, 0, 0);
  return { world, look, set, place, run };
}

describe('HeadLook', () => {
  it('turns to a player ahead and to the side', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(2);

    expect(set.yaw).toBeCloseTo(Math.PI / 4, 3);
    expect(set.pitch).toBeCloseTo(0, 3);
    expect(set.weight).toBeCloseTo(1, 3);
  });

  it('looks up at a player above it', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(0, 2.5, 2.2);
    run(2);

    expect(set.yaw).toBeCloseTo(0, 3);
    expect(set.pitch).toBeCloseTo(Math.PI / 4, 3);
  });

  it('measures from the creature, whichever way it faces', () => {
    const { world, set, place, run } = setup();
    place(10, 10, Math.PI / 2);
    // Heading +X, with the player 3 m along it and 3 m to its +Z side.
    world.player = new Vector3(13.2, 0.5, 13);
    run(2);

    expect(set.yaw).toBeCloseTo(-Math.PI / 4, 3);
    expect(set.weight).toBeCloseTo(1, 3);
  });

  it('does not snap: the first frame is a small part of the turn', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(DT);

    expect(set.weight).toBeGreaterThan(0);
    expect(set.weight).toBeLessThan(0.3);
  });

  it('eases to a new direction, without jumping', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(2);
    const before = set.yaw;
    world.player.set(-3, 0.5, 3.2);
    run(DT);

    expect(set.yaw).toBeLessThan(before);
    expect(set.yaw).toBeGreaterThan(0);
  });

  it('looks forward again when the player is behind it', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(2);
    world.player.set(0, 0.5, -5);
    run(2);

    expect(set.weight).toBe(0);
  });

  it('looks forward again when the player is past the pitch limit', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(0, 8, 1);
    run(2);

    expect(set.weight).toBe(0);
  });

  it('ignores a player outside its radius', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(0, 0.5, 11);
    run(2);

    expect(set.weight).toBe(0);
  });

  it('holds its last direction as it fades, so the head does not swing', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(2);
    const yaw = set.yaw;
    world.player.set(0, 0.5, -5);
    run(0.1);

    expect(set.yaw).toBe(yaw);
    expect(set.weight).toBeLessThan(1);
    expect(set.weight).toBeGreaterThan(0);
  });

  it('starts from the new direction after it has faded out', () => {
    const { world, set, run } = setup();
    world.player = new Vector3(3, 0.5, 3.2);
    run(2);
    world.player.set(0, 0.5, -5);
    run(2);
    world.player.set(-3, 0.5, 3.2);
    run(DT);

    expect(set.yaw).toBeCloseTo(-Math.PI / 4, 3);
  });

  it('stays off with no player', () => {
    const { set, run } = setup();
    run(1);

    expect(set.weight).toBe(0);
  });
});
