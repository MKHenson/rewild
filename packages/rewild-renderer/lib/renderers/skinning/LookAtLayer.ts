import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { ClipPlayer } from './ClipPlayer';
import { aboutAxis, conjugate, multiply } from './poseMath';
import { POSE_STRIDE, PoseSlotData, PoseStore } from './PoseStore';

/** Part of the turn the last bone of a chain takes. The rest split evenly. */
export const HEAD_SHARE = 0.5;

/** Floats a slot takes: yaw, pitch, weight. */
const VALUES = 3;

const _world = new Float32Array(4);
const _local = new Float32Array(4);
const _turn = new Float32Array(4);
const _a = new Float32Array(4);
const _b = new Float32Array(4);

/**
 * Turns a bone chain of every instance of one skinned model, on top of the
 * clips. It runs after ClipPlayer.update, which rewrites each playing slot, so
 * the turn never builds up from frame to frame. A slot with no clip playing or
 * no weight is skipped.
 *
 * Angles are in model space, where forward is +Z and up is +Y.
 */
export class LookAtLayer implements PoseSlotData {
  /** The last bone of the chain in the rest pose, in model space. */
  readonly origin = new Vector3();

  private readonly poses: PoseStore;
  private readonly player: ClipPlayer;
  private readonly rootRotation = new Float32Array([0, 0, 0, 1]);
  private chain: string[] | null = null;
  /** Every joint from the root to the last bone of the chain. */
  private path = new Int32Array(0);
  /** Part of the turn each joint of `path` takes. */
  private shares = new Float32Array(0);
  private values = new Float32Array(0);

  constructor(poses: PoseStore, player: ClipPlayer) {
    this.poses = poses;
    this.player = player;
    poses.attach(this);
  }

  /**
   * Names the bones to turn, parent first. A model has one chain, so asking
   * for a different one throws.
   */
  setChain(bones: string[]): void {
    if (this.chain) {
      if (this.chain.join() === bones.join()) return;
      throw new Error(
        `Look-at chain [${bones}] differs from this model's [${this.chain}].`
      );
    }
    if (bones.length === 0) throw new Error('Look-at chain is empty.');

    const { names, parents } = this.poses.skeleton;
    const joints = bones.map((bone) => {
      const joint = names.indexOf(bone);
      if (joint < 0) throw new Error(`Look-at bone '${bone}' does not exist.`);
      return joint;
    });

    const path: number[] = [];
    for (let j = joints[joints.length - 1]; j >= 0; j = parents[j])
      path.unshift(j);

    const shares = new Float32Array(path.length);
    const neckShare =
      joints.length > 1 ? (1 - HEAD_SHARE) / (joints.length - 1) : 0;
    let previous = -1;
    joints.forEach((joint, i) => {
      const at = path.indexOf(joint);
      if (at <= previous)
        throw new Error(`Look-at chain [${bones}] is not parent first.`);
      previous = at;
      shares[at] = i === joints.length - 1 ? 1 - neckShare * i : neckShare;
    });

    this.path = new Int32Array(path);
    this.shares = shares;
    this.chain = bones.slice();
    this.readRest();
  }

  /**
   * Sets a slot's turn in radians. Positive yaw turns toward +X and positive
   * pitch turns up. Weight scales the turn, and 0 skips the slot.
   */
  set(slot: number, yaw: number, pitch: number, weight: number): void {
    const v = slot * VALUES;
    this.values[v] = yaw;
    this.values[v + 1] = pitch;
    this.values[v + 2] = weight;
  }

  /** Writes every slot's turn into the working pose. */
  apply(): void {
    if (this.path.length === 0) return;

    const { poses, player, values } = this;
    const poseSize = poses.jointCount * POSE_STRIDE;
    for (let slot = 0; slot < poses.count; slot++) {
      const v = slot * VALUES;
      const weight = values[v + 2];
      if (weight <= 0 || !player.isPlaying(slot)) continue;
      this.applySlot(
        slot * poseSize,
        values[v] * weight,
        values[v + 1] * weight
      );
    }
  }

  grow(capacity: number): void {
    const values = new Float32Array(capacity * VALUES);
    values.set(this.values);
    this.values = values;
  }

  moveSlot(from: number, to: number): void {
    this.values.copyWithin(to * VALUES, from * VALUES, (from + 1) * VALUES);
  }

  clearSlot(slot: number): void {
    this.values.fill(0, slot * VALUES, (slot + 1) * VALUES);
  }

  /**
   * Each chain bone must end up at D × its clip rotation in model space, where
   * D is the turn reached so far. With W the parent's clip rotation and E the
   * part of D this bone adds, its local rotation becomes W⁻¹ E W × local.
   */
  private applySlot(offset: number, yaw: number, pitch: number): void {
    const { path, shares } = this;
    const { pose } = this.poses;
    let reached = 0;
    let doneYaw = 0;
    let donePitch = 0;

    _world.set(this.rootRotation);
    for (let i = 0; i < path.length; i++) {
      const p = offset + path[i] * POSE_STRIDE + 3;
      _local[0] = pose[p];
      _local[1] = pose[p + 1];
      _local[2] = pose[p + 2];
      _local[3] = pose[p + 3];

      const share = shares[i];
      if (share > 0) {
        reached += share;
        const nextYaw = yaw * reached;
        const nextPitch = pitch * reached;

        // E = D(parent)⁻¹ D(bone), with D = Ry(yaw) Rx(−pitch).
        aboutAxis(_turn, 1, 0, 0, donePitch);
        aboutAxis(_a, 0, 1, 0, nextYaw - doneYaw);
        multiply(_turn, 0, _turn, 0, _a, 0);
        aboutAxis(_a, 1, 0, 0, -nextPitch);
        multiply(_turn, 0, _turn, 0, _a, 0);

        multiply(_turn, 0, _turn, 0, _world, 0);
        conjugate(_a, 0, _world, 0);
        multiply(_turn, 0, _a, 0, _turn, 0);
        multiply(_b, 0, _turn, 0, _local, 0);

        pose[p] = _b[0];
        pose[p + 1] = _b[1];
        pose[p + 2] = _b[2];
        pose[p + 3] = _b[3];

        doneYaw = nextYaw;
        donePitch = nextPitch;
      }

      multiply(_world, 0, _world, 0, _local, 0);
    }
  }

  private readRest(): void {
    const { rootMatrix } = this.poses.skeleton;
    const { restPose } = this.poses;
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const local = new Matrix4();
    const matrix = new Matrix4().fromArray(rootMatrix);

    matrix.decompose(position, rotation, scale);
    this.rootRotation.set([rotation.x, rotation.y, rotation.z, rotation.w]);

    for (let i = 0; i < this.path.length; i++) {
      const r = this.path[i] * POSE_STRIDE;
      position.set(restPose[r], restPose[r + 1], restPose[r + 2]);
      rotation.set(
        restPose[r + 3],
        restPose[r + 4],
        restPose[r + 5],
        restPose[r + 6]
      );
      scale.set(restPose[r + 7], restPose[r + 8], restPose[r + 9]);
      matrix.multiply(local.compose(position, rotation, scale));
    }

    const m = matrix.elements;
    this.origin.set(m[12], m[13], m[14]);
  }
}
