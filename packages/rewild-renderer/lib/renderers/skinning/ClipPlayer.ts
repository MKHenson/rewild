import { GltfClip, GltfClipChannel } from '../../core/GltfSkeleton';
import { POSE_STRIDE, PoseSlotData, PoseStore } from './PoseStore';

/** Clips an instance can blend at once. */
export const MAX_LAYERS = 6;

const LOOP = 1;
const NO_CLIP = -1;
const _q = new Float32Array(4);

/**
 * Plays and blends the clips of one skinned model for every instance in its
 * PoseStore. Each slot holds up to MAX_LAYERS weighted layers, a clip with its
 * own time, rate and fade. `update` advances them and writes the blend into
 * the working pose.
 *
 * Weights that sum under 1 leave the rest pose in the remainder, so a clip
 * faded out alone settles into the rest pose. Weights over 1 are normalised.
 */
export class ClipPlayer implements PoseSlotData {
  readonly clips: GltfClip[];

  private readonly poses: PoseStore;
  private readonly clipByName = new Map<string, number>();
  private clip = new Int32Array(0);
  private time = new Float32Array(0);
  private rate = new Float32Array(0);
  private weight = new Float32Array(0);
  private target = new Float32Array(0);
  /** Weight change per second towards `target`. */
  private fadeSpeed = new Float32Array(0);
  private flags = new Uint8Array(0);

  constructor(poses: PoseStore, clips: GltfClip[]) {
    this.poses = poses;
    this.clips = clips;
    clips.forEach((clip, i) => this.clipByName.set(clip.name, i));
    poses.attach(this);
  }

  hasClip(name: string): boolean {
    return this.clipByName.has(name);
  }

  /** The clip's length in seconds, or −1 if the model has no such clip. */
  duration(name: string): number {
    const index = this.clipByName.get(name);
    return index === undefined ? -1 : this.clips[index].duration;
  }

  /**
   * Crossfades to `clip` over `fade` seconds: it rises to full weight and
   * every other layer falls to 0. A clip already playing keeps its time.
   */
  play(handle: number, clip: string, fade = 0, loop = true): boolean {
    const slot = this.poses.slotOf(handle);
    const layer = this.layerFor(slot, clip, loop);
    if (layer < 0) return false;

    const base = slot * MAX_LAYERS;
    for (let i = base; i < base + MAX_LAYERS; i++)
      if (this.clip[i] !== NO_CLIP) this.fade(i, i === layer ? 1 : 0, fade);
    return true;
  }

  /** Fades one clip to `weight` over `fade` seconds, leaving the others. */
  fadeTo(
    handle: number,
    clip: string,
    weight: number,
    fade = 0,
    loop = true
  ): boolean {
    const layer = this.layerFor(this.poses.slotOf(handle), clip, loop);
    if (layer < 0) return false;
    this.fade(layer, weight, fade);
    return true;
  }

  /** Fades a clip out over `fade` seconds. Its layer frees at weight 0. */
  stop(handle: number, clip: string, fade = 0): void {
    const layer = this.find(handle, clip);
    if (layer >= 0) this.fade(layer, 0, fade);
  }

  stopAll(handle: number, fade = 0): void {
    const slot = this.poses.slotOf(handle);
    if (slot < 0) return;
    const base = slot * MAX_LAYERS;
    for (let i = base; i < base + MAX_LAYERS; i++)
      if (this.clip[i] !== NO_CLIP) this.fade(i, 0, fade);
  }

  /** Playback speed, 1 by default. Negative plays backwards. */
  setRate(handle: number, clip: string, rate: number): void {
    const layer = this.find(handle, clip);
    if (layer >= 0) this.rate[layer] = rate;
  }

  setTime(handle: number, clip: string, seconds: number): void {
    const layer = this.find(handle, clip);
    if (layer >= 0) this.time[layer] = this.wrap(layer, seconds);
  }

  /** Seconds into the clip, or −1 when it is not playing. */
  timeOf(handle: number, clip: string): number {
    const layer = this.find(handle, clip);
    return layer < 0 ? -1 : this.time[layer];
  }

  /** The clip's current blend weight, 0 when it is not playing. */
  weightOf(handle: number, clip: string): number {
    const layer = this.find(handle, clip);
    return layer < 0 ? 0 : this.weight[layer];
  }

  /** Advances every layer by `dt` seconds and writes the blended poses. */
  update(dt: number): void {
    const { poses, clip, time, rate, weight, target, fadeSpeed } = this;
    const { pose, restPose, jointCount } = poses;
    const poseSize = jointCount * POSE_STRIDE;
    let changed = false;

    for (let slot = 0; slot < poses.count; slot++) {
      const base = slot * MAX_LAYERS;
      let active = false;
      let total = 0;

      for (let i = base; i < base + MAX_LAYERS; i++) {
        if (clip[i] === NO_CLIP) continue;
        active = true;

        const w = weight[i];
        const goal = target[i];
        const step = fadeSpeed[i] * dt;
        weight[i] =
          w < goal ? Math.min(goal, w + step) : Math.max(goal, w - step);

        if (weight[i] <= 0 && goal <= 0) {
          clip[i] = NO_CLIP;
          continue;
        }

        time[i] = this.wrap(i, time[i] + rate[i] * dt);
        total += weight[i];
      }

      if (!active) continue;
      changed = true;

      const offset = slot * poseSize;
      pose.set(restPose, offset);

      const scale = total > 1 ? 1 / total : 1;
      for (let i = base; i < base + MAX_LAYERS; i++)
        if (clip[i] !== NO_CLIP)
          this.accumulate(
            this.clips[clip[i]],
            time[i],
            weight[i] * scale,
            offset
          );

      for (let j = 0; j < jointCount; j++)
        normalizeQuat(pose, offset + j * POSE_STRIDE + 3);
    }

    if (changed) poses.markPoseChanged();
  }

  grow(capacity: number): void {
    const size = capacity * MAX_LAYERS;
    const clip = new Int32Array(size).fill(NO_CLIP);
    clip.set(this.clip);
    this.clip = clip;
    this.time = grown(this.time, size);
    this.rate = grown(this.rate, size);
    this.weight = grown(this.weight, size);
    this.target = grown(this.target, size);
    this.fadeSpeed = grown(this.fadeSpeed, size);
    const flags = new Uint8Array(size);
    flags.set(this.flags);
    this.flags = flags;
  }

  moveSlot(from: number, to: number): void {
    const start = from * MAX_LAYERS;
    const end = start + MAX_LAYERS;
    const dest = to * MAX_LAYERS;
    this.clip.copyWithin(dest, start, end);
    this.time.copyWithin(dest, start, end);
    this.rate.copyWithin(dest, start, end);
    this.weight.copyWithin(dest, start, end);
    this.target.copyWithin(dest, start, end);
    this.fadeSpeed.copyWithin(dest, start, end);
    this.flags.copyWithin(dest, start, end);
  }

  clearSlot(slot: number): void {
    const base = slot * MAX_LAYERS;
    this.clip.fill(NO_CLIP, base, base + MAX_LAYERS);
  }

  /** The clip's layer in the slot, added at weight 0 if it is not playing. */
  private layerFor(slot: number, name: string, loop: boolean): number {
    const index = this.clipByName.get(name);
    if (slot < 0 || index === undefined) return -1;

    const base = slot * MAX_LAYERS;
    let free = -1;
    let weakest = base;
    for (let i = base; i < base + MAX_LAYERS; i++) {
      if (this.clip[i] === index) {
        this.flags[i] = loop ? LOOP : 0;
        return i;
      }
      if (this.clip[i] === NO_CLIP) {
        if (free < 0) free = i;
      } else if (this.weight[i] < this.weight[weakest]) weakest = i;
    }

    const layer = free >= 0 ? free : weakest;
    this.clip[layer] = index;
    this.time[layer] = 0;
    this.rate[layer] = 1;
    this.weight[layer] = 0;
    this.target[layer] = 0;
    this.fadeSpeed[layer] = 0;
    this.flags[layer] = loop ? LOOP : 0;
    return layer;
  }

  private find(handle: number, name: string): number {
    const slot = this.poses.slotOf(handle);
    const index = this.clipByName.get(name);
    if (slot < 0 || index === undefined) return -1;

    const base = slot * MAX_LAYERS;
    for (let i = base; i < base + MAX_LAYERS; i++)
      if (this.clip[i] === index) return i;
    return -1;
  }

  /** Every fade lasts `seconds`, whatever weight it starts from. */
  private fade(layer: number, weight: number, seconds: number): void {
    this.target[layer] = weight;
    if (seconds <= 0) {
      this.weight[layer] = weight;
      this.fadeSpeed[layer] = 0;
    } else {
      this.fadeSpeed[layer] = Math.abs(weight - this.weight[layer]) / seconds;
    }
  }

  private wrap(layer: number, t: number): number {
    const { duration } = this.clips[this.clip[layer]];
    if (duration <= 0) return 0;
    if (this.flags[layer] & LOOP) return ((t % duration) + duration) % duration;
    return Math.min(Math.max(t, 0), duration);
  }

  /** Adds `w × (sample − rest)` for each channel into the pose at `offset`. */
  private accumulate(
    clip: GltfClip,
    t: number,
    w: number,
    offset: number
  ): void {
    if (w <= 0) return;
    const { pose, restPose } = this.poses;
    const channels = clip.channels;

    for (let c = 0; c < channels.length; c++) {
      const channel = channels[c];
      const r = channel.joint * POSE_STRIDE;
      const p = offset + r;

      if (channel.path === 'rotation') {
        sampleRotation(channel, t, _q);
        const r0 = restPose[r + 3];
        const r1 = restPose[r + 4];
        const r2 = restPose[r + 5];
        const r3 = restPose[r + 6];
        const sign =
          _q[0] * r0 + _q[1] * r1 + _q[2] * r2 + _q[3] * r3 < 0 ? -1 : 1;
        pose[p + 3] += w * (sign * _q[0] - r0);
        pose[p + 4] += w * (sign * _q[1] - r1);
        pose[p + 5] += w * (sign * _q[2] - r2);
        pose[p + 6] += w * (sign * _q[3] - r3);
      } else {
        const at = channel.path === 'translation' ? 0 : 7;
        sampleVector(channel, t, _q);
        pose[p + at] += w * (_q[0] - restPose[r + at]);
        pose[p + at + 1] += w * (_q[1] - restPose[r + at + 1]);
        pose[p + at + 2] += w * (_q[2] - restPose[r + at + 2]);
      }
    }
  }
}

function grown(old: Float32Array, size: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(size);
  next.set(old);
  return next;
}

/** The last key at or before `t`. −1 before the first key. */
function keyBefore(times: Float32Array, t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (t < times[0]) return -1;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Fraction between key `k` and the next, or −1 to hold key `k`. */
function keyFraction(channel: GltfClipChannel, k: number, t: number): number {
  const { times } = channel;
  if (k < 0 || k >= times.length - 1 || channel.interpolation === 'STEP')
    return -1;
  const span = times[k + 1] - times[k];
  return span > 0 ? (t - times[k]) / span : 0;
}

function sampleVector(
  channel: GltfClipChannel,
  t: number,
  out: Float32Array
): void {
  const { values } = channel;
  const k = keyBefore(channel.times, t);
  const a = Math.max(k, 0) * 3;
  const f = keyFraction(channel, k, t);

  if (f < 0) {
    out[0] = values[a];
    out[1] = values[a + 1];
    out[2] = values[a + 2];
    return;
  }

  const b = a + 3;
  out[0] = values[a] + (values[b] - values[a]) * f;
  out[1] = values[a + 1] + (values[b + 1] - values[a + 1]) * f;
  out[2] = values[a + 2] + (values[b + 2] - values[a + 2]) * f;
}

/** Slerp between keys, on the short arc. */
function sampleRotation(
  channel: GltfClipChannel,
  t: number,
  out: Float32Array
): void {
  const { values } = channel;
  const k = keyBefore(channel.times, t);
  const a = Math.max(k, 0) * 4;
  const f = keyFraction(channel, k, t);

  const ax = values[a];
  const ay = values[a + 1];
  const az = values[a + 2];
  const aw = values[a + 3];
  if (f < 0) {
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
    out[3] = aw;
    return;
  }

  const b = a + 4;
  let bx = values[b];
  let by = values[b + 1];
  let bz = values[b + 2];
  let bw = values[b + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let s0 = 1 - f;
  let s1 = f;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    s0 = Math.sin((1 - f) * angle) / sin;
    s1 = Math.sin(f * angle) / sin;
  }

  out[0] = ax * s0 + bx * s1;
  out[1] = ay * s0 + by * s1;
  out[2] = az * s0 + bz * s1;
  out[3] = aw * s0 + bw * s1;
  normalizeQuat(out, 0);
}

function normalizeQuat(q: Float32Array, o: number): void {
  const len = Math.sqrt(
    q[o] * q[o] +
      q[o + 1] * q[o + 1] +
      q[o + 2] * q[o + 2] +
      q[o + 3] * q[o + 3]
  );
  if (len === 0) {
    q[o + 3] = 1;
    return;
  }
  const inv = 1 / len;
  q[o] *= inv;
  q[o + 1] *= inv;
  q[o + 2] *= inv;
  q[o + 3] *= inv;
}
