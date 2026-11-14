import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { ClipPlayer } from './ClipPlayer';
import { aboutAxis, between, conjugate, multiply, rotate } from './poseMath';
import { POSE_STRIDE, PoseSlotData, PoseStore } from './PoseStore';

/** Floats a foot's model-space position takes in `feet`. */
const FOOT = 3;

/** Floats a slot takes before its offsets: weight, pitch share, roll share. */
const HEAD = 3;

/** Below this, a knee is taken as straight and bends about its rest axis. */
const STRAIGHT = 1e-6;

/** Below this share of the feet's spread squared, the feet are taken as in a line. */
const IN_LINE = 1e-4;

const _knee = new Float32Array(4);
const _swing = new Float32Array(4);
const _upper = new Float32Array(4);
const _lower = new Float32Array(4);
const _inverse = new Float32Array(4);
const _local = new Float32Array(4);
const _tilt = new Float32Array(4);
const _turn = new Float32Array(4);
const _v = new Float32Array(3);

interface Leg {
  /** Every joint from the root to the foot, parent first. */
  path: Int32Array;
  /** Indices into `path` of the two solved bones and the bone they carry. */
  upper: number;
  lower: number;
  end: number;
  /** Model-space position, rotation and uniform scale of each path joint. */
  position: Float32Array;
  rotation: Float32Array;
  scale: Float32Array;
  /** The rest knee axis in the upper bone's frame, used when a clip holds the leg straight. */
  bend: Float32Array;
  /** Upper plus lower bone length at rest, in model space. */
  reach: number;
  /** For the slot being solved: where the carried bone goes, its clip rotation, and the clip's hip height. */
  target: Float32Array;
  endRotation: Float32Array;
  hip: number;
}

/**
 * Plants the feet of every instance of one skinned model, on top of the clips
 * and look-at. Each leg names an upper and a lower bone, which it solves as
 * two-bone IK, then the bone below them, which keeps its clip rotation in
 * model space so the rest of the foot moves with it unbent.
 *
 * Each slot sets a vertical offset per foot in model space. With three or more
 * legs, the legs' nearest shared parent first turns by a share of the slope
 * through the offsets, so the body tilts with the ground. It then moves up or
 * down so no leg stretches, and each leg reaches the rest. A slot the clips did
 * not rewrite this frame, or with no weight, is skipped.
 */
export class FootIKLayer implements PoseSlotData {
  private readonly poses: PoseStore;
  private readonly player: ClipPlayer;
  private readonly rootPosition = new Float32Array(3);
  private readonly rootRotation = new Float32Array([0, 0, 0, 1]);
  private rootScale = 1;
  private chains: string[][] | null = null;
  private legs: Leg[] = [];
  /** The legs' nearest shared parent, as a joint and as its index in each path. */
  private pelvis = -1;
  private pelvisAt = -1;
  private capacity = 0;
  /** Per slot: the weight, the pitch and roll shares, then each leg's offset. */
  private stride = HEAD;
  private values = new Float32Array(0);
  /** Per slot and leg: the clip's foot position in model space, before IK. */
  private feet = new Float32Array(0);

  constructor(poses: PoseStore, player: ClipPlayer) {
    this.poses = poses;
    this.player = player;
    poses.attach(this);
  }

  get legCount(): number {
    return this.legs.length;
  }

  /**
   * Names each leg's bones, parent first: the upper and lower bones IK bends,
   * the bone they carry, then optionally its descendants down to the foot,
   * whose position is reported. A model has one set of legs, so asking for
   * different ones throws.
   */
  setLegs(chains: string[][]): void {
    if (this.chains) {
      if (JSON.stringify(this.chains) === JSON.stringify(chains)) return;
      throw new Error(
        `Foot IK legs ${JSON.stringify(chains)} differ from this model's.`
      );
    }
    if (chains.length === 0) throw new Error('Foot IK has no legs.');

    const { names, parents } = this.poses.skeleton;
    const legs = chains.map((bones) => {
      if (bones.length < 3)
        throw new Error(
          `Leg [${bones}] needs an upper, a lower and a carried bone.`
        );
      const joints = bones.map((bone) => {
        const joint = names.indexOf(bone);
        if (joint < 0) throw new Error(`Leg bone '${bone}' does not exist.`);
        return joint;
      });
      if (parents[joints[1]] !== joints[0] || parents[joints[2]] !== joints[1])
        throw new Error(
          `Leg [${bones}] must start with a bone, its child and its grandchild.`
        );

      const path: number[] = [];
      for (let j = joints[joints.length - 1]; j >= 0; j = parents[j])
        path.unshift(j);
      let previous = -1;
      for (const joint of joints) {
        const at = path.indexOf(joint);
        if (at <= previous)
          throw new Error(`Leg [${bones}] is not parent first.`);
        previous = at;
      }

      const length = path.length;
      return {
        path: new Int32Array(path),
        upper: path.indexOf(joints[0]),
        lower: path.indexOf(joints[1]),
        end: path.indexOf(joints[2]),
        position: new Float32Array(length * 3),
        rotation: new Float32Array(length * 4),
        scale: new Float32Array(length),
        bend: new Float32Array(3),
        reach: 0,
        target: new Float32Array(3),
        endRotation: new Float32Array(4),
        hip: 0,
      };
    });

    let shared = legs[0].upper;
    for (const leg of legs) {
      let i = 0;
      while (i < shared && i < leg.upper && leg.path[i] === legs[0].path[i])
        i++;
      shared = i;
    }
    if (shared === 0) throw new Error('Foot IK legs share no parent bone.');

    this.legs = legs;
    this.pelvisAt = shared - 1;
    this.pelvis = legs[0].path[this.pelvisAt];
    this.chains = chains.map((bones) => bones.slice());
    this.stride = HEAD + legs.length;
    this.values = new Float32Array(this.capacity * this.stride);
    this.feet = new Float32Array(this.capacity * legs.length * FOOT);
    this.readRest();
  }

  /** Upper plus lower bone length of a leg at rest, in model space. */
  legReach(leg: number): number {
    return this.legs[leg].reach;
  }

  /** Scales every offset of a slot. 0 skips the slot. */
  setWeight(slot: number, weight: number): void {
    this.values[slot * this.stride] = weight;
  }

  /**
   * Part of the slope through the feet that the body follows, along it and
   * across it, from 0 to 1. Only used with three or more legs.
   */
  setTilt(slot: number, pitch: number, roll: number): void {
    const v = slot * this.stride;
    this.values[v + 1] = pitch;
    this.values[v + 2] = roll;
  }

  /** Moves a foot up, or down when negative, in model space. */
  setOffset(slot: number, leg: number, offset: number): void {
    this.values[slot * this.stride + HEAD + leg] = offset;
  }

  /**
   * The clip's foot position in model space, before IK, as of the last apply
   * that ran with weight. Zero before then.
   */
  footPosition(slot: number, leg: number, out: Vector3): Vector3 {
    const f = (slot * this.legs.length + leg) * FOOT;
    return out.set(this.feet[f], this.feet[f + 1], this.feet[f + 2]);
  }

  /** Writes every slot's foot placement into the working pose. */
  apply(): void {
    const { legs, poses, player, values, feet, stride } = this;
    if (legs.length === 0) return;

    const poseSize = poses.jointCount * POSE_STRIDE;
    for (let slot = 0; slot < poses.count; slot++) {
      const v = slot * stride;
      const weight = values[v];
      if (weight <= 0 || !player.posed(slot)) continue;

      const offset = slot * poseSize;
      let low = Infinity;
      let high = -Infinity;
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const { position: P, rotation: R } = leg;
        this.forward(leg, offset);
        const foot = (leg.path.length - 1) * 3;
        const f = (slot * legs.length + i) * FOOT;
        feet[f] = P[foot];
        feet[f + 1] = P[foot + 1];
        feet[f + 2] = P[foot + 2];

        const lift = values[v + HEAD + i] * weight;
        if (lift < low) low = lift;
        if (lift > high) high = lift;
        const c = leg.end * 3;
        leg.target[0] = P[c];
        leg.target[1] = P[c + 1] + lift;
        leg.target[2] = P[c + 2];
        const r = leg.end * 4;
        leg.endRotation[0] = R[r];
        leg.endRotation[1] = R[r + 1];
        leg.endRotation[2] = R[r + 2];
        leg.endRotation[3] = R[r + 3];
        leg.hip = P[leg.upper * 3 + 1];
      }
      if (low === 0 && high === 0) continue;

      const tilted = legs.length >= 3 && this.tilt(slot, offset, weight);
      let drop = Infinity;
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const rise = tilted ? leg.position[leg.upper * 3 + 1] - leg.hip : 0;
        const room = values[v + HEAD + i] * weight - rise;
        if (room < drop) drop = room;
      }

      this.shiftPelvis(offset, drop);
      for (let i = 0; i < legs.length; i++) this.solve(legs[i], offset, drop);
    }
  }

  grow(capacity: number): void {
    this.capacity = capacity;
    const values = new Float32Array(capacity * this.stride);
    values.set(
      this.values.subarray(0, Math.min(this.values.length, values.length))
    );
    this.values = values;
    const feet = new Float32Array(capacity * this.legs.length * FOOT);
    feet.set(this.feet.subarray(0, Math.min(this.feet.length, feet.length)));
    this.feet = feet;
  }

  moveSlot(from: number, to: number): void {
    const { stride } = this;
    this.values.copyWithin(to * stride, from * stride, (from + 1) * stride);
    const size = this.legs.length * FOOT;
    this.feet.copyWithin(to * size, from * size, (from + 1) * size);
  }

  clearSlot(slot: number): void {
    const { stride } = this;
    this.values.fill(0, slot * stride, (slot + 1) * stride);
    const size = this.legs.length * FOOT;
    this.feet.fill(0, slot * size, (slot + 1) * size);
  }

  /** Model-space transforms of a leg's path from the pose at `offset`. */
  private forward(
    leg: Leg,
    offset: number,
    pose: Float32Array = this.poses.pose
  ): void {
    const { path, position, rotation, scale } = leg;
    for (let i = 0; i < path.length; i++) {
      const p = offset + path[i] * POSE_STRIDE;
      const parentPosition = i === 0 ? this.rootPosition : position;
      const parentRotation = i === 0 ? this.rootRotation : rotation;
      const pp = i === 0 ? 0 : (i - 1) * 3;
      const pr = i === 0 ? 0 : (i - 1) * 4;
      const parentScale = i === 0 ? this.rootScale : scale[i - 1];

      rotate(
        position,
        i * 3,
        parentRotation,
        pr,
        pose[p] * parentScale,
        pose[p + 1] * parentScale,
        pose[p + 2] * parentScale
      );
      position[i * 3] += parentPosition[pp];
      position[i * 3 + 1] += parentPosition[pp + 1];
      position[i * 3 + 2] += parentPosition[pp + 2];
      multiply(rotation, i * 4, parentRotation, pr, pose, p + 3);
      scale[i] = parentScale * pose[p + 7];
    }
  }

  /**
   * Fits a plane through the feet's offsets and turns the shared parent by the
   * slot's share of its slope, about the point between the feet at the shared
   * parent's height. Then measures every leg again. False when it turns nothing.
   */
  private tilt(slot: number, offset: number, weight: number): boolean {
    const { legs, values, feet } = this;
    const v = slot * this.stride;
    const pitchShare = values[v + 1];
    const rollShare = values[v + 2];
    if (pitchShare === 0 && rollShare === 0) return false;

    const n = legs.length;
    const f0 = slot * n * FOOT;
    let mx = 0;
    let mz = 0;
    let mo = 0;
    for (let i = 0; i < n; i++) {
      mx += feet[f0 + i * FOOT];
      mz += feet[f0 + i * FOOT + 2];
      mo += values[v + HEAD + i] * weight;
    }
    mx /= n;
    mz /= n;
    mo /= n;

    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    let sxo = 0;
    let szo = 0;
    for (let i = 0; i < n; i++) {
      const dx = feet[f0 + i * FOOT] - mx;
      const dz = feet[f0 + i * FOOT + 2] - mz;
      const d = values[v + HEAD + i] * weight - mo;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
      sxo += dx * d;
      szo += dz * d;
    }
    const det = sxx * szz - sxz * sxz;
    if (det <= IN_LINE * (sxx + szz) * (sxx + szz)) return false;

    const across = (sxo * szz - szo * sxz) / det;
    const along = (szo * sxx - sxo * sxz) / det;
    const pitch = -Math.atan(along * pitchShare);
    const roll = Math.atan(across * rollShare);
    if (pitch === 0 && roll === 0) return false;

    aboutAxis(_tilt, 0, 0, 1, roll);
    aboutAxis(_turn, 1, 0, 0, pitch);
    multiply(_tilt, 0, _tilt, 0, _turn, 0);
    const py = legs[0].position[this.pelvisAt * 3 + 1];
    this.turnPelvis(offset, mx, py, mz);
    for (let i = 0; i < n; i++) this.forward(legs[i], offset);
    return true;
  }

  /** Turns the shared parent by `_tilt` in model space about (px, py, pz). */
  private turnPelvis(offset: number, px: number, py: number, pz: number): void {
    const leg = this.legs[0];
    const at = this.pelvisAt;
    const { position: P, rotation: R } = leg;
    const parentPosition = at === 0 ? this.rootPosition : P;
    const parentRotation = at === 0 ? this.rootRotation : R;
    const pp = at === 0 ? 0 : (at - 1) * 3;
    const pr = at === 0 ? 0 : (at - 1) * 4;
    const scale = at === 0 ? this.rootScale : leg.scale[at - 1];

    rotate(
      _v,
      0,
      _tilt,
      0,
      P[at * 3] - px,
      P[at * 3 + 1] - py,
      P[at * 3 + 2] - pz
    );
    const x = (px + _v[0] - parentPosition[pp]) / scale;
    const y = (py + _v[1] - parentPosition[pp + 1]) / scale;
    const z = (pz + _v[2] - parentPosition[pp + 2]) / scale;

    conjugate(_inverse, 0, parentRotation, pr);
    multiply(_turn, 0, _tilt, 0, R, at * 4);
    multiply(_local, 0, _inverse, 0, _turn, 0);
    rotate(_v, 0, _inverse, 0, x, y, z);

    const p = offset + this.pelvis * POSE_STRIDE;
    const { pose } = this.poses;
    pose[p] = _v[0];
    pose[p + 1] = _v[1];
    pose[p + 2] = _v[2];
    pose.set(_local, p + 3);
  }

  /** Moves the shared parent by `drop` along model up. */
  private shiftPelvis(offset: number, drop: number): void {
    const leg = this.legs[0];
    const at = this.pelvisAt;
    const rotation = at === 0 ? this.rootRotation : leg.rotation;
    const r = at === 0 ? 0 : (at - 1) * 4;
    const scale = at === 0 ? this.rootScale : leg.scale[at - 1];

    conjugate(_inverse, 0, rotation, r);
    rotate(_v, 0, _inverse, 0, 0, drop / scale, 0);
    const p = offset + this.pelvis * POSE_STRIDE;
    const { pose } = this.poses;
    pose[p] += _v[0];
    pose[p + 1] += _v[1];
    pose[p + 2] += _v[2];
  }

  /**
   * Bends the knee to the hip-to-target distance, then swings the upper bone
   * onto the target. The carried bone gets back its clip rotation. `drop` is
   * how far the shared parent moved since the leg was last measured.
   */
  private solve(leg: Leg, offset: number, drop: number): void {
    const { position: P, rotation: R, path, target } = leg;
    const a = leg.upper * 3;
    const b = leg.lower * 3;
    const c = leg.end * 3;

    const ax = P[a];
    const ay = P[a + 1] + drop;
    const az = P[a + 2];
    const bx = P[b];
    const by = P[b + 1] + drop;
    const bz = P[b + 2];
    const ux = ax - bx;
    const uy = ay - by;
    const uz = az - bz;
    const vx = P[c] - bx;
    const vy = P[c + 1] + drop - by;
    const vz = P[c + 2] - bz;
    const tx = target[0] - ax;
    const ty = target[1] - ay;
    const tz = target[2] - az;

    const la = Math.hypot(ux, uy, uz);
    const lb = Math.hypot(vx, vy, vz);
    const reach = Math.min(
      la + lb,
      Math.max(Math.abs(la - lb), Math.hypot(tx, ty, tz))
    );

    let kx = uy * vz - uz * vy;
    let ky = uz * vx - ux * vz;
    let kz = ux * vy - uy * vx;
    const sine = Math.hypot(kx, ky, kz);
    const before = Math.atan2(sine, ux * vx + uy * vy + uz * vz);
    if (sine <= STRAIGHT * la * lb) {
      rotate(_v, 0, R, leg.upper * 4, leg.bend[0], leg.bend[1], leg.bend[2]);
      kx = _v[0];
      ky = _v[1];
      kz = _v[2];
    } else {
      kx /= sine;
      ky /= sine;
      kz /= sine;
    }
    const cosine = (la * la + lb * lb - reach * reach) / (2 * la * lb);
    const after = Math.acos(Math.min(1, Math.max(-1, cosine)));
    aboutAxis(_knee, kx, ky, kz, after - before);

    rotate(_v, 0, _knee, 0, vx, vy, vz);
    between(
      _swing,
      bx + _v[0] - ax,
      by + _v[1] - ay,
      bz + _v[2] - az,
      tx,
      ty,
      tz
    );

    multiply(_upper, 0, _swing, 0, R, leg.upper * 4);
    multiply(_lower, 0, _knee, 0, R, leg.lower * 4);
    multiply(_lower, 0, _swing, 0, _lower, 0);

    const { pose } = this.poses;
    conjugate(_inverse, 0, R, (leg.upper - 1) * 4);
    multiply(_local, 0, _inverse, 0, _upper, 0);
    pose.set(_local, offset + path[leg.upper] * POSE_STRIDE + 3);

    conjugate(_inverse, 0, _upper, 0);
    multiply(_local, 0, _inverse, 0, _lower, 0);
    pose.set(_local, offset + path[leg.lower] * POSE_STRIDE + 3);

    conjugate(_inverse, 0, _lower, 0);
    multiply(_local, 0, _inverse, 0, leg.endRotation, 0);
    pose.set(_local, offset + path[leg.end] * POSE_STRIDE + 3);
  }

  private readRest(): void {
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    new Matrix4()
      .fromArray(this.poses.skeleton.rootMatrix)
      .decompose(position, rotation, scale);
    this.rootPosition.set([position.x, position.y, position.z]);
    this.rootRotation.set([rotation.x, rotation.y, rotation.z, rotation.w]);
    this.rootScale = scale.x;

    for (const leg of this.legs) {
      this.forward(leg, 0, this.poses.restPose);
      const P = leg.position;
      const a = leg.upper * 3;
      const b = leg.lower * 3;
      const c = leg.end * 3;
      const ux = P[a] - P[b];
      const uy = P[a + 1] - P[b + 1];
      const uz = P[a + 2] - P[b + 2];
      const vx = P[c] - P[b];
      const vy = P[c + 1] - P[b + 1];
      const vz = P[c + 2] - P[b + 2];
      leg.reach = Math.hypot(ux, uy, uz) + Math.hypot(vx, vy, vz);

      let kx = uy * vz - uz * vy;
      let ky = uz * vx - ux * vz;
      let kz = ux * vy - uy * vx;
      const length = Math.hypot(kx, ky, kz);
      if (length > 0) {
        kx /= length;
        ky /= length;
        kz /= length;
      } else {
        kx = 1;
        ky = 0;
        kz = 0;
      }
      conjugate(_inverse, 0, leg.rotation, leg.upper * 4);
      rotate(leg.bend, 0, _inverse, 0, kx, ky, kz);
    }
  }
}
