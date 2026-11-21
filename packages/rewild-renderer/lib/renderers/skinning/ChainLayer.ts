import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { ClipPlayer } from './ClipPlayer';
import { POSE_STRIDE, PoseSlotData, PoseStore } from './PoseStore';

/** How a wave runs down a bone chain. */
export interface ChainShape {
  /** Part of the chain, from its first bone, that stays straight. 0 bends it all. */
  stiff: number;
  /** Length of one wave, in chain lengths. */
  wavelength: number;
  /** Part of the amplitude the stiff front still swings with, as a head
   *  swings against the tail. Left out, 0. */
  head?: number;
}

/** Floats a slot takes: phase, amplitude, curve, weight. */
const VALUES = 4;
const TWO_PI = Math.PI * 2;

const _world = new Float32Array(4);
const _local = new Float32Array(4);
const _turn = new Float32Array(4);
const _a = new Float32Array(4);
const _b = new Float32Array(4);

/**
 * Bends a bone chain of every instance of one skinned model from side to side
 * about model up, on top of the clips: a wave that travels from the first bone
 * to the last, plus a curve along the whole chain. The first bone is the front.
 *
 * Each bone sets the direction of the chain behind it. At a point `s` along
 * the chain, 0 at the first bone and 1 at the last, that direction is
 * `amplitude × envelope(s) × sin(2πs / wavelength − phase) − curve × (s − pivot)`
 * radians about model +Y. The envelope is `head` over the stiff front, rising as the
 * square of the way through the rest to 1 at the last bone. It runs after ClipPlayer.update, on the slots it rewrote,
 * and turns the player's `alwaysPose` on so a slot with no clip still poses.
 */
export class ChainLayer implements PoseSlotData {
  private readonly poses: PoseStore;
  private readonly player: ClipPlayer;
  private readonly rootRotation = new Float32Array([0, 0, 0, 1]);
  /** The chain's rest length in model space. 0 without a chain. */
  length = 0;
  /** Where along the chain the model origin lies. A curve turns the chain
   *  about it, so the body there keeps the model's facing. */
  pivot = 0;
  private chain: string[] | null = null;
  private wavelength = 1;
  /** Every joint from the root to the last bone of the chain. */
  private path = new Int32Array(0);
  /** Per `path` joint: where it lies along the chain, or −1 off it. */
  private along = new Float32Array(0);
  /** Per `path` joint: the part of the amplitude it takes. */
  private envelope = new Float32Array(0);
  private values = new Float32Array(0);

  constructor(poses: PoseStore, player: ClipPlayer) {
    this.poses = poses;
    this.player = player;
    poses.attach(this);
  }

  /**
   * Names the bones to bend, parent first, front to back. A model has one
   * chain, so asking for a different one throws.
   */
  setChain(bones: string[], shape: ChainShape): void {
    if (this.chain) {
      if (this.chain.join() === bones.join()) return;
      throw new Error(
        `Chain [${bones}] differs from this model's [${this.chain}].`
      );
    }
    if (bones.length < 2) throw new Error('A chain needs two bones or more.');

    const { names, parents } = this.poses.skeleton;
    const joints = bones.map((bone) => {
      const joint = names.indexOf(bone);
      if (joint < 0) throw new Error(`Chain bone '${bone}' does not exist.`);
      return joint;
    });

    const path: number[] = [];
    for (let j = joints[joints.length - 1]; j >= 0; j = parents[j])
      path.unshift(j);

    const at: number[] = [];
    let previous = -1;
    for (const joint of joints) {
      const index = path.indexOf(joint);
      if (index <= previous)
        throw new Error(`Chain [${bones}] is not parent first.`);
      at.push(index);
      previous = index;
    }

    this.path = new Int32Array(path);
    this.along = new Float32Array(path.length).fill(-1);
    this.envelope = new Float32Array(path.length);
    this.readRest(at, shape.stiff, shape.head ?? 0);
    this.wavelength = shape.wavelength;
    this.chain = bones.slice();
    this.player.alwaysPose = true;
  }

  /**
   * Sets a slot's wave: `phase` in radians, `amplitude` in radians at the last
   * bone, and `curve` in radians from the first bone to the last, positive
   * turning the front toward +X and the back away, as a body turning toward
   * +X. Weight scales all of it, and 0 skips the slot.
   */
  set(
    slot: number,
    phase: number,
    amplitude: number,
    curve: number,
    weight: number
  ): void {
    const v = slot * VALUES;
    this.values[v] = phase;
    this.values[v + 1] = amplitude;
    this.values[v + 2] = curve;
    this.values[v + 3] = weight;
  }

  /** Writes every slot's bend into the working pose. */
  apply(): void {
    if (this.path.length === 0) return;

    const { poses, player, values } = this;
    const poseSize = poses.jointCount * POSE_STRIDE;
    for (let slot = 0; slot < poses.count; slot++) {
      const v = slot * VALUES;
      const weight = values[v + 3];
      if (weight <= 0 || !player.posed(slot)) continue;
      this.applySlot(
        slot * poseSize,
        values[v],
        values[v + 1] * weight,
        values[v + 2] * weight
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
   * With D the turn about +Y a bone's chain direction takes, and W its
   * parent's clip rotation in model space, the bone's local rotation becomes
   * W⁻¹ E W × local, where E = D(parent)⁻¹ D(bone).
   */
  private applySlot(
    offset: number,
    phase: number,
    amplitude: number,
    curve: number
  ): void {
    const { path, along, envelope } = this;
    const { pose } = this.poses;
    const k = TWO_PI / this.wavelength;
    let done = 0;

    _world.set(this.rootRotation);
    for (let i = 0; i < path.length; i++) {
      const p = offset + path[i] * POSE_STRIDE + 3;
      _local[0] = pose[p];
      _local[1] = pose[p + 1];
      _local[2] = pose[p + 2];
      _local[3] = pose[p + 3];

      const s = along[i];
      if (s >= 0) {
        const angle =
          amplitude * envelope[i] * Math.sin(k * s - phase) -
          curve * (s - this.pivot);
        Quaternion.setFromAxisAngleFlat(_turn, 0, 0, 1, 0, angle - done);
        Quaternion.multiplyQuaternionsFlat(_turn, 0, _turn, 0, _world, 0);
        Quaternion.conjugateFlat(_a, 0, _world, 0);
        Quaternion.multiplyQuaternionsFlat(_turn, 0, _a, 0, _turn, 0);
        Quaternion.multiplyQuaternionsFlat(_b, 0, _turn, 0, _local, 0);

        pose[p] = _b[0];
        pose[p + 1] = _b[1];
        pose[p + 2] = _b[2];
        pose[p + 3] = _b[3];
        done = angle;
      }

      Quaternion.multiplyQuaternionsFlat(_world, 0, _world, 0, _local, 0);
    }
  }

  /** Places the chain bones along it by their rest positions in model space. */
  private readRest(at: number[], stiff: number, head: number): void {
    const { rootMatrix } = this.poses.skeleton;
    const { restPose } = this.poses;
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const local = new Matrix4();
    const matrix = new Matrix4().fromArray(rootMatrix);

    matrix.decompose(position, rotation, scale);
    this.rootRotation.set([rotation.x, rotation.y, rotation.z, rotation.w]);

    const points: Vector3[] = [];
    for (let i = 0, next = 0; i < this.path.length; i++) {
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
      if (at[next] !== i) continue;
      const m = matrix.elements;
      points.push(new Vector3(m[12], m[13], m[14]));
      next++;
    }

    const lengths = [0];
    for (let i = 1; i < points.length; i++)
      lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    const total = lengths[lengths.length - 1];
    if (total <= 0) throw new Error('Chain bones all sit at one point.');
    this.length = total;

    let nearest = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const segment = position.subVectors(points[i], a);
      const span = segment.lengthSq();
      const t = span > 0 ? Math.max(0, Math.min(1, -a.dot(segment) / span)) : 0;
      const distance = segment.multiplyScalar(t).add(a).length();
      if (distance >= nearest) continue;
      nearest = distance;
      this.pivot = (lengths[i - 1] + t * (lengths[i] - lengths[i - 1])) / total;
    }

    const bend = Math.max(1e-6, 1 - stiff);
    at.forEach((index, i) => {
      const s = lengths[i] / total;
      const e = Math.max(0, (s - stiff) / bend);
      this.along[index] = s;
      this.envelope[index] = head + (1 - head) * e * e;
    });
  }
}
