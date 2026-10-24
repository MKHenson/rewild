import { GltfSkeleton } from '../../core/GltfSkeleton';
import { POSE_STRIDE, PoseStore } from './PoseStore';

function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

const IDENTITY = translation(0, 0, 0);

/** hip at (0, 1, 0), leg 0.5 below it, with inverse binds for that rest pose. */
function skeleton(): GltfSkeleton {
  return {
    names: ['hip', 'leg'],
    parents: new Int32Array([-1, 0]),
    translations: new Float32Array([0, 1, 0, 0, -0.5, 0]),
    rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
    scales: new Float32Array([1, 1, 1, 1, 1, 1]),
    inverseBindMatrices: new Float32Array([
      ...translation(0, -1, 0),
      ...translation(0, -0.5, 0),
    ]),
    rootMatrix: new Float32Array(IDENTITY),
  };
}

function jointMatrix(poses: PoseStore, slot: number, joint: number): number[] {
  const o = (slot * poses.jointCount + joint) * 16;
  return Array.from(poses.jointMatrices.subarray(o, o + 16));
}

function expectMatrix(actual: number[], expected: number[]) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value));
}

describe('PoseStore', () => {
  it('gives each instance its own handle and slot', () => {
    const poses = new PoseStore(skeleton());
    const a = poses.add();
    const b = poses.add();

    expect(a).not.toBe(b);
    expect(poses.count).toBe(2);
    expect(poses.slotOf(a)).toBe(0);
    expect(poses.slotOf(b)).toBe(1);
  });

  it('moves the last pose into a removed slot, and its handle follows', () => {
    const poses = new PoseStore(skeleton());
    const a = poses.add();
    poses.add();
    const c = poses.add();
    poses.pose[poses.poseOffset(c)] = 7;

    expect(poses.remove(a)).toBe(true);

    expect(poses.count).toBe(2);
    expect(poses.has(a)).toBe(false);
    expect(poses.slotOf(a)).toBe(-1);
    expect(poses.slotOf(c)).toBe(0);
    expect(poses.pose[poses.poseOffset(c)]).toBe(7);
  });

  it('ignores a handle it does not hold', () => {
    const poses = new PoseStore(skeleton());
    const a = poses.add();
    poses.remove(a);

    expect(poses.remove(a)).toBe(false);
    expect(poses.count).toBe(0);
  });

  it('keeps every pose when it grows past its capacity', () => {
    const poses = new PoseStore(skeleton(), 2);
    const handles = [0, 1, 2, 3, 4].map(() => poses.add());
    handles.forEach((h, i) => (poses.pose[poses.poseOffset(h)] = i));

    expect(poses.capacity).toBeGreaterThanOrEqual(5);
    handles.forEach((h, i) => expect(poses.pose[poses.poseOffset(h)]).toBe(i));
  });

  it('builds identity joint matrices in the rest pose', () => {
    const poses = new PoseStore(skeleton());
    poses.add();
    poses.add();

    expect(poses.update()).toBe(true);
    for (let slot = 0; slot < 2; slot++)
      for (let joint = 0; joint < 2; joint++)
        expectMatrix(jointMatrix(poses, slot, joint), IDENTITY);
  });

  it('carries a parent joint into its children', () => {
    const poses = new PoseStore(skeleton());
    const handle = poses.add();
    poses.update();

    // Lift the hip by 2: both joints move with it.
    poses.pose[poses.poseOffset(handle) + 1] = 3;
    poses.markPoseChanged();
    poses.update();

    expectMatrix(jointMatrix(poses, 0, 0), translation(0, 2, 0));
    expectMatrix(jointMatrix(poses, 0, 1), translation(0, 2, 0));
  });

  it('rotates a child about its parent', () => {
    const poses = new PoseStore(skeleton());
    const handle = poses.add();

    // Hip turned 180 degrees about z: the leg swings from below it to above.
    poses.pose.set([0, 0, 1, 0], poses.poseOffset(handle) + 3);
    poses.markPoseChanged();
    poses.update();

    const leg = jointMatrix(poses, 0, 1);
    // The leg's bind position (0, 0.5, 0) lands at (0, 1.5, 0).
    expect(leg[5] * 0.5 + leg[13]).toBeCloseTo(1.5);
  });

  it('skips the rebuild when nothing changed', () => {
    const poses = new PoseStore(skeleton());
    poses.add();
    poses.update();

    expect(poses.update()).toBe(false);
  });

  it('flags the joint matrices for upload when a removal moves a slot', () => {
    const poses = new PoseStore(skeleton());
    const a = poses.add();
    poses.add();
    poses.update();
    poses.jointsChanged = false;

    poses.remove(a);

    expect(poses.jointsChanged).toBe(true);
  });

  it('packs a joint as translation, rotation and scale', () => {
    expect(POSE_STRIDE).toBe(10);
    const poses = new PoseStore(skeleton());
    const handle = poses.add();
    const p = poses.poseOffset(handle) + POSE_STRIDE;

    expect(Array.from(poses.pose.subarray(p, p + POSE_STRIDE))).toEqual([
      0, -0.5, 0, 0, 0, 0, 1, 1, 1, 1,
    ]);
  });
});
