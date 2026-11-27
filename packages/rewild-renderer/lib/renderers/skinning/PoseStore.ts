import { Matrix4 } from 'rewild-common';
import { GltfSkeleton } from '../../core/GltfSkeleton';

/** Floats a joint takes in the working pose: translation, rotation xyzw, scale. */
export const POSE_STRIDE = 10;
const MATRIX = 16;

/** Per-slot state kept beside a PoseStore that follows its slots. */
export interface PoseSlotData {
  grow(capacity: number): void;
  /** Called after `from` has moved into `to`. */
  moveSlot(from: number, to: number): void;
  clearSlot(slot: number): void;
}

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
  /** Slots `changedFrom` to `changedTo − 1` hold every changed joint matrix. */
  changedFrom = 0;
  changedTo = 0;

  private posesDirty = false;
  /** Slots whose working pose changed since their joint matrices were built. */
  private dirty = new Uint8Array(0);
  private handleBySlot = new Int32Array(0);
  private readonly slotByHandle = new Map<number, number>();
  private nextHandle = 1;
  /** Rest TRS of every joint, laid out as one slot of `pose`. */
  readonly restPose: Float32Array;

  private readonly slotData: PoseSlotData[] = [];
  private readonly world: Float32Array;
  private readonly local = new Float32Array(MATRIX);
  /** Each joint's bind matrix: the inverse of its inverse bind. */
  private readonly bindMatrices: Float32Array;

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

    this.bindMatrices = new Float32Array(this.jointCount * MATRIX);
    const bind = new Matrix4();
    for (let j = 0; j < this.jointCount; j++)
      bind
        .fromArray(skeleton.inverseBindMatrices, j * MATRIX)
        .invert()
        .toArray(this.bindMatrices, j * MATRIX);

    this.grow(initialCapacity);
  }

  /** Keeps `data` sized to the store and moved with its slots. */
  attach(data: PoseSlotData): void {
    data.grow(this.capacity);
    this.slotData.push(data);
  }

  /** Adds an instance in the rest pose. */
  add(): number {
    if (this.count === this.capacity) this.grow(this.capacity * 2);

    const slot = this.count++;
    const handle = this.nextHandle++;
    this.handleBySlot[slot] = handle;
    this.slotByHandle.set(handle, slot);
    this.pose.set(this.restPose, slot * this.restPose.length);
    for (const data of this.slotData) data.clearSlot(slot);

    this.markPoseChanged(slot);
    return handle;
  }

  /** Removes an instance, moving the last one into its slot. */
  remove(handle: number): boolean {
    const slot = this.slotByHandle.get(handle);
    if (slot === undefined) return false;

    const last = this.count - 1;
    if (slot !== last) {
      this.moveSlot(last, slot);
      for (const data of this.slotData) data.moveSlot(last, slot);
      const moved = this.handleBySlot[last];
      this.handleBySlot[slot] = moved;
      this.slotByHandle.set(moved, slot);
      this.dirty[slot] = this.dirty[last];
      this.markJointsChanged(slot);
    }
    this.dirty[last] = 0;

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

  /** Call after writing into `pose`, with the slot written, or none for all. */
  markPoseChanged(slot = -1): void {
    this.posesDirty = true;
    if (slot < 0) this.dirty.fill(1, 0, this.count);
    else this.dirty[slot] = 1;
  }

  /** A joint's model-space matrix in the slot's pose, as of the last `update`. */
  jointModelMatrix(slot: number, joint: number, out: Matrix4): Matrix4 {
    Matrix4.multiplyMatricesFlat(
      out.elements,
      0,
      this.jointMatrices,
      (slot * this.jointCount + joint) * MATRIX,
      this.bindMatrices,
      joint * MATRIX
    );
    return out;
  }

  /** Call once the changed joint matrices are uploaded. */
  clearJointsChanged(): void {
    this.jointsChanged = false;
    this.changedFrom = 0;
    this.changedTo = 0;
  }

  /** Rebuilds the joint matrices of changed slots. False if nothing changed. */
  update(): boolean {
    if (!this.posesDirty) return false;
    this.posesDirty = false;

    const { parents, inverseBindMatrices, rootMatrix } = this.skeleton;
    const { pose, world, local, jointMatrices, jointCount, dirty } = this;

    for (let slot = 0; slot < this.count; slot++) {
      if (dirty[slot] === 0) continue;
      dirty[slot] = 0;
      this.markJointsChanged(slot);

      const poseBase = slot * jointCount * POSE_STRIDE;
      const outBase = slot * jointCount * MATRIX;

      for (let j = 0; j < jointCount; j++) {
        const trs = poseBase + j * POSE_STRIDE;
        Matrix4.composeFlat(local, 0, pose, trs, pose, trs + 3, pose, trs + 7);
        const parent = parents[j];
        if (parent < 0)
          Matrix4.multiplyMatricesFlat(
            world,
            j * MATRIX,
            rootMatrix,
            0,
            local,
            0
          );
        else
          Matrix4.multiplyMatricesFlat(
            world,
            j * MATRIX,
            world,
            parent * MATRIX,
            local,
            0
          );

        Matrix4.multiplyMatricesFlat(
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

  private markJointsChanged(slot: number): void {
    if (!this.jointsChanged) {
      this.jointsChanged = true;
      this.changedFrom = slot;
      this.changedTo = slot + 1;
      return;
    }
    if (slot < this.changedFrom) this.changedFrom = slot;
    if (slot >= this.changedTo) this.changedTo = slot + 1;
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

    const dirty = new Uint8Array(capacity);
    dirty.set(this.dirty);
    this.dirty = dirty;

    const handles = new Int32Array(capacity);
    handles.set(this.handleBySlot);
    this.handleBySlot = handles;
    this.capacity = capacity;
    for (const data of this.slotData) data.grow(capacity);
  }
}

function grown(old: Float32Array, size: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(old);
  return next;
}
