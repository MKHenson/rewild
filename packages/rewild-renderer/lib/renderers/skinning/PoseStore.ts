import { GltfSkeleton } from '../../core/GltfSkeleton';

/** Floats a joint takes in the working pose: translation, rotation xyzw, scale. */
export const POSE_STRIDE = 10;
const MATRIX = 16;

/**
 * The poses of every instance of one skinned model, in flat arrays a slot
 * apiece.
 *
 * Live instances fill slots 0 to count−1. Removing one moves the last into its
 * slot, so code outside holds a handle and asks for the slot when it needs it.
 *
 * `pose` is the input: joint-local TRS per joint, POSE_STRIDE floats each.
 * `jointMatrices` is the output in the GPU layout: model-space joint matrices
 * with the inverse bind applied, 16 floats each.
 */
export class PoseStore {
  readonly skeleton: GltfSkeleton;
  readonly jointCount: number;
  count = 0;
  capacity = 0;
  pose = new Float32Array(0);
  jointMatrices = new Float32Array(0);
  /** Joint matrices changed since the owner last uploaded them. */
  jointsChanged = false;

  private posesDirty = false;
  private handleBySlot = new Int32Array(0);
  private readonly slotByHandle = new Map<number, number>();
  private nextHandle = 1;
  private readonly restPose: Float32Array;
  private readonly world: Float32Array;
  private readonly local = new Float32Array(MATRIX);

  constructor(skeleton: GltfSkeleton, initialCapacity = 8) {
    this.skeleton = skeleton;
    this.jointCount = skeleton.names.length;
    this.world = new Float32Array(this.jointCount * MATRIX);
    this.restPose = new Float32Array(this.jointCount * POSE_STRIDE);

    for (let j = 0; j < this.jointCount; j++) {
      const p = j * POSE_STRIDE;
      this.restPose.set(skeleton.translations.subarray(j * 3, j * 3 + 3), p);
      this.restPose.set(skeleton.rotations.subarray(j * 4, j * 4 + 4), p + 3);
      this.restPose.set(skeleton.scales.subarray(j * 3, j * 3 + 3), p + 7);
    }

    this.grow(initialCapacity);
  }

  /** Adds an instance in the rest pose. */
  add(): number {
    if (this.count === this.capacity) this.grow(this.capacity * 2);

    const slot = this.count++;
    const handle = this.nextHandle++;
    this.handleBySlot[slot] = handle;
    this.slotByHandle.set(handle, slot);
    this.pose.set(this.restPose, slot * this.restPose.length);

    this.posesDirty = true;
    return handle;
  }

  /** Removes an instance, moving the last one into its slot. */
  remove(handle: number): boolean {
    const slot = this.slotByHandle.get(handle);
    if (slot === undefined) return false;

    const last = this.count - 1;
    if (slot !== last) {
      this.moveSlot(last, slot);
      const moved = this.handleBySlot[last];
      this.handleBySlot[slot] = moved;
      this.slotByHandle.set(moved, slot);
      this.jointsChanged = true;
    }

    this.slotByHandle.delete(handle);
    this.count--;
    return true;
  }

  has(handle: number): boolean {
    return this.slotByHandle.has(handle);
  }

  /** The instance's current slot, or −1 once removed. Do not keep it. */
  slotOf(handle: number): number {
    return this.slotByHandle.get(handle) ?? -1;
  }

  /** Where the instance's working pose starts in `pose`. */
  poseOffset(handle: number): number {
    return this.slotOf(handle) * this.jointCount * POSE_STRIDE;
  }

  /** Call after writing into `pose`. */
  markPoseChanged(): void {
    this.posesDirty = true;
  }

  /** Rebuilds every joint matrix from the working pose. False if nothing changed. */
  update(): boolean {
    if (!this.posesDirty) return false;
    this.posesDirty = false;
    this.jointsChanged = true;

    const { parents, inverseBindMatrices, rootMatrix } = this.skeleton;
    const { pose, world, local, jointMatrices, jointCount } = this;

    for (let slot = 0; slot < this.count; slot++) {
      const poseBase = slot * jointCount * POSE_STRIDE;
      const outBase = slot * jointCount * MATRIX;

      for (let j = 0; j < jointCount; j++) {
        composeInto(local, pose, poseBase + j * POSE_STRIDE);
        const parent = parents[j];
        if (parent < 0)
          multiplyInto(world, j * MATRIX, rootMatrix, 0, local, 0);
        else multiplyInto(world, j * MATRIX, world, parent * MATRIX, local, 0);

        multiplyInto(
          jointMatrices,
          outBase + j * MATRIX,
          world,
          j * MATRIX,
          inverseBindMatrices,
          j * MATRIX
        );
      }
    }

    return true;
  }

  private moveSlot(from: number, to: number): void {
    const poseSize = this.jointCount * POSE_STRIDE;
    const jointSize = this.jointCount * MATRIX;
    this.pose.copyWithin(to * poseSize, from * poseSize, (from + 1) * poseSize);
    this.jointMatrices.copyWithin(
      to * jointSize,
      from * jointSize,
      (from + 1) * jointSize
    );
  }

  private grow(capacity: number): void {
    this.pose = grown(this.pose, capacity * this.jointCount * POSE_STRIDE);
    this.jointMatrices = grown(
      this.jointMatrices,
      capacity * this.jointCount * MATRIX
    );

    const handles = new Int32Array(capacity);
    handles.set(this.handleBySlot);
    this.handleBySlot = handles;
    this.capacity = capacity;
  }
}

function grown(old: Float32Array, size: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(old);
  return next;
}

/** Column-major matrix from a TRS at `pose[p]`, written into `out`. */
function composeInto(out: Float32Array, pose: Float32Array, p: number): void {
  const x = pose[p + 3];
  const y = pose[p + 4];
  const z = pose[p + 5];
  const w = pose[p + 6];
  const sx = pose[p + 7];
  const sy = pose[p + 8];
  const sz = pose[p + 9];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = pose[p];
  out[13] = pose[p + 1];
  out[14] = pose[p + 2];
  out[15] = 1;
}

/** Column-major `a * b` into `out`. `out` must not overlap either input. */
function multiplyInto(
  out: Float32Array,
  o: number,
  a: Float32Array,
  ao: number,
  b: Float32Array,
  bo: number
): void {
  for (let col = 0; col < 4; col++) {
    const b0 = b[bo + col * 4];
    const b1 = b[bo + col * 4 + 1];
    const b2 = b[bo + col * 4 + 2];
    const b3 = b[bo + col * 4 + 3];
    for (let row = 0; row < 4; row++)
      out[o + col * 4 + row] =
        a[ao + row] * b0 +
        a[ao + 4 + row] * b1 +
        a[ao + 8 + row] * b2 +
        a[ao + 12 + row] * b3;
  }
}
