import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { FootIKSettings } from './CreaturePresets';
import { FootPlant, FootTarget } from './FootPlant';
import { TestWorld } from './testWorld';

const SETTINGS: FootIKSettings = { smoothing: 0.05, maxStep: 0.4 };
const DT = 1 / 60;
const REACH = 2;

/** Two feet 1 m either side of the pivot, on its x axis. */
function setup(settings = SETTINGS) {
  const world = new TestWorld();
  const transform = new Transform();
  const feet = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0)];
  const set = { offsets: [0, 0], weight: -1, tilt: [-1, -1] };
  const target: FootTarget = {
    footCount: 2,
    legReach: () => REACH,
    footPosition: (leg, out) => out.copy(feet[leg]),
    setFootOffset: (leg, offset) => (set.offsets[leg] = offset),
    setFootWeight: (weight) => (set.weight = weight),
    setBodyTilt: (pitch, roll) => (set.tilt = [pitch, roll]),
  };
  const plant = new FootPlant(settings, target, transform, world);
  const place = (x: number, y: number, heading = 0, scale = 1) => {
    transform.position.set(x, y, 0);
    transform.rotation.set(0, heading, 0, transform.rotation.order);
    transform.scale.set(scale, scale, scale);
    transform.updateMatrixWorld();
  };
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) plant.update(DT);
  };
  place(0, 0);
  return { world, set, place, run };
}

describe('FootPlant', () => {
  it('sets each foot to the ground under it, from the pivot', () => {
    const { world, set, run } = setup();
    world.height = (x) => x * 0.3;
    run(1);

    expect(set.offsets[0]).toBeCloseTo(0.3, 3);
    expect(set.offsets[1]).toBeCloseTo(-0.3, 3);
    expect(set.weight).toBeCloseTo(1, 3);
  });

  it('leaves the feet alone on flat ground', () => {
    const { set, run } = setup();
    run(1);

    expect(set.offsets).toEqual([0, 0]);
  });

  it('eases to a new height, without jumping', () => {
    const { world, set, run } = setup();
    world.height = (x) => x * 0.3;
    run(DT);

    expect(set.offsets[0]).toBeGreaterThan(0);
    expect(set.offsets[0]).toBeLessThan(0.15);
  });

  it('limits a step to a part of the leg reach', () => {
    const { world, set, run } = setup();
    world.height = (x) => x * 5;
    run(1);

    expect(set.offsets[0]).toBeCloseTo(SETTINGS.maxStep * REACH, 3);
    expect(set.offsets[1]).toBeCloseTo(-SETTINGS.maxStep * REACH, 3);
  });

  it('measures the feet where the creature faces', () => {
    const { world, set, place, run } = setup();
    world.height = (x) => x * 0.3;
    place(0, 0, Math.PI);
    run(1);

    expect(set.offsets[0]).toBeCloseTo(-0.3, 3);
    expect(set.offsets[1]).toBeCloseTo(0.3, 3);
  });

  it('gives offsets in model space for a scaled creature', () => {
    const { world, set, place, run } = setup();
    world.height = (x) => x * 0.3;
    place(0, 0, 0, 2);
    run(1);

    expect(set.offsets[0]).toBeCloseTo(0.3, 3);
    expect(set.offsets[1]).toBeCloseTo(-0.3, 3);
  });

  it('fades out while the creature is off the ground', () => {
    const { world, set, place, run } = setup();
    world.height = (x) => x * 0.3;
    run(1);
    place(0, 3);
    run(1);

    expect(set.weight).toBe(0);
    expect(set.offsets[0]).toBeCloseTo(0, 3);
  });

  it('passes on the body tilt, none when left out', () => {
    expect(setup().set.tilt).toEqual([0, 0]);
    expect(setup({ ...SETTINGS, pitch: 0.8, roll: 0.3 }).set.tilt).toEqual([
      0.8, 0.3,
    ]);
  });

  it('holds a foot level where there is no ground under it', () => {
    const { world, set, run } = setup();
    world.height = (x) => (x > 0.5 ? null : 0);
    run(1);

    expect(set.offsets[0]).toBe(0);
  });
});
