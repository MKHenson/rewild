import { GltfSkeleton } from '../../core/GltfSkeleton';
import {
  FAR_POSE_INTERVAL,
  FULL_RATE_DISTANCE,
  NEAR_POSE_INTERVAL,
  NEAR_RATE_DISTANCE,
  PoseSchedule,
  poseInterval,
} from './PoseSchedule';
import { PoseStore } from './PoseStore';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const DT = 1 / 60;

function skeleton(): GltfSkeleton {
  return {
    names: ['hip'],
    parents: new Int32Array([-1]),
    translations: new Float32Array([0, 0, 0]),
    rotations: new Float32Array([0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1]),
    inverseBindMatrices: new Float32Array(IDENTITY),
    rootMatrix: new Float32Array(IDENTITY),
  };
}

function setup() {
  const poses = new PoseStore(skeleton());
  const schedule = new PoseSchedule(poses);
  return { poses, schedule };
}

/** Frames out of `frames` the slot was due, drawn `distance` m from the camera each frame. */
function dueFrames(
  schedule: PoseSchedule,
  slot: number,
  distance: number,
  frames: number
): number {
  let due = 0;
  for (let f = 0; f < frames; f++) {
    schedule.seen(slot, distance, 0, 0);
    due += schedule.plan(DT, 0, 0, 0)[slot];
  }
  return due;
}

describe('PoseSchedule', () => {
  it('builds a new slot on its first frame, before any draw', () => {
    const { poses, schedule } = setup();
    const handle = poses.add();

    expect(schedule.plan(DT, 0, 0, 0)[poses.slotOf(handle)]).toBe(1);
  });

  it('skips a slot no draw reported', () => {
    const { poses, schedule } = setup();
    poses.add();
    schedule.plan(DT, 0, 0, 0);

    for (let f = 0; f < 10; f++) expect(schedule.plan(DT, 0, 0, 0)[0]).toBe(0);
  });

  it('builds a slot at once when a draw reports it again after its interval', () => {
    const { poses, schedule } = setup();
    poses.add();
    schedule.plan(DT, 0, 0, 0);
    for (let f = 0; f < 4; f++) schedule.plan(DT, 0, 0, 0);

    schedule.seen(0, 100, 0, 0);
    expect(schedule.plan(DT, 0, 0, 0)[0]).toBe(1);
  });

  it('builds less often the further the slot is from the camera', () => {
    const builds = (distance: number) => {
      const { poses, schedule } = setup();
      poses.add();
      schedule.plan(DT, 0, 0, 0);
      return dueFrames(schedule, 0, distance, 60);
    };

    expect(builds(5)).toBe(60);
    expect(builds(30)).toBe(30);
    expect(builds(80)).toBe(15);
  });

  it('spreads slots that come into view together over the frames', () => {
    const { poses, schedule } = setup();
    for (let i = 0; i < 8; i++) poses.add();
    schedule.plan(DT, 0, 0, 0);
    for (let f = 0; f < 10; f++) schedule.plan(DT, 0, 0, 0);

    const perFrame: number[] = [];
    for (let f = 0; f < 8; f++) {
      for (let slot = 0; slot < 8; slot++) schedule.seen(slot, 80, 0, 0);
      const due = schedule.plan(DT, 0, 0, 0);
      perFrame.push(due.slice(0, 8).reduce((sum, d) => sum + d, 0));
    }

    expect(perFrame[0]).toBe(8);
    expect(Math.max(...perFrame.slice(1))).toBeLessThan(8);
  });

  it('measures distance from the camera it is given', () => {
    const { poses, schedule } = setup();
    poses.add();
    schedule.plan(DT, 0, 0, 0);

    let due = 0;
    for (let f = 0; f < 60; f++) {
      schedule.seen(0, 200, 0, 0);
      due += schedule.plan(DT, 198, 0, 0)[0];
    }
    expect(due).toBe(60);
  });

  it('picks the interval by distance', () => {
    expect(poseInterval(FULL_RATE_DISTANCE)).toBe(0);
    expect(poseInterval(NEAR_RATE_DISTANCE)).toBe(NEAR_POSE_INTERVAL);
    expect(poseInterval(NEAR_RATE_DISTANCE + 1)).toBe(FAR_POSE_INTERVAL);
  });

  it('keeps a moved slot’s state on swap-remove', () => {
    const { poses, schedule } = setup();
    const a = poses.add();
    const b = poses.add();
    schedule.plan(DT, 0, 0, 0);

    schedule.seen(poses.slotOf(b), 5, 0, 0);
    poses.remove(a);

    expect(schedule.plan(DT, 0, 0, 0)[poses.slotOf(b)]).toBe(1);
  });
});
