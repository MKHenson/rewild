import { PoseSlotData, PoseStore } from './PoseStore';

/** Within this many metres of the camera, a pose builds every frame. */
export const FULL_RATE_DISTANCE = 20;
/** Within this many metres, a pose builds every NEAR_POSE_INTERVAL. Past it, every FAR_POSE_INTERVAL. */
export const NEAR_RATE_DISTANCE = 40;
export const NEAR_POSE_INTERVAL = 1 / 30;
export const FAR_POSE_INTERVAL = 1 / 15;

const GOLDEN = 0.618034;
/** Frame times add up to a hair under an interval in float32. */
const SLACK = 1e-4;
const POSITION = 3;
/** Past every interval. A slot this stale builds next, then takes a phase of its own. */
const STALE = 2 * FAR_POSE_INTERVAL;

/**
 * Picks the slots that build a pose each frame. Every draw reports the slots
 * it drew and where. The next frame builds only those, and the further one
 * is from the camera, the less often. A slot no draw reported keeps its pose,
 * and builds on the first frame a draw reports it once its interval is up.
 */
export class PoseSchedule implements PoseSlotData {
  /** Per slot: 1 if it builds its pose this frame. Set by `plan`. */
  due = new Uint8Array(0);

  private readonly poses: PoseStore;
  private seenBy = new Uint8Array(0);
  private position = new Float32Array(0);
  /** Seconds since the slot last built its pose. */
  private elapsed = new Float32Array(0);

  constructor(poses: PoseStore) {
    this.poses = poses;
    poses.attach(this);
  }

  /** Reports a slot drawn at a world position this frame. */
  seen(slot: number, x: number, y: number, z: number): void {
    const p = slot * POSITION;
    this.seenBy[slot] = 1;
    this.position[p] = x;
    this.position[p + 1] = y;
    this.position[p + 2] = z;
  }

  /**
   * Marks the slots due this frame, `dt` seconds on, by their distance from
   * the camera at `x, y, z`, and clears what the draws reported.
   */
  plan(dt: number, x: number, y: number, z: number): Uint8Array {
    const { due, seenBy, position, elapsed } = this;

    for (let slot = 0; slot < this.poses.count; slot++) {
      const e = elapsed[slot] + dt;
      due[slot] = 0;

      if (seenBy[slot] === 0) {
        elapsed[slot] = Math.min(e, STALE);
        continue;
      }
      seenBy[slot] = 0;

      const p = slot * POSITION;
      const interval = poseInterval(
        Math.hypot(position[p] - x, position[p + 1] - y, position[p + 2] - z)
      );
      if (e + SLACK < interval) {
        elapsed[slot] = e;
        continue;
      }

      due[slot] = 1;
      const rest = e - interval;
      elapsed[slot] =
        rest < interval ? rest : interval * ((slot * GOLDEN) % 1);
    }

    return due;
  }

  grow(capacity: number): void {
    this.due = grownBytes(this.due, capacity);
    this.seenBy = grownBytes(this.seenBy, capacity);
    const position = new Float32Array(capacity * POSITION);
    position.set(this.position);
    this.position = position;
    const elapsed = new Float32Array(capacity);
    elapsed.set(this.elapsed);
    this.elapsed = elapsed;
  }

  moveSlot(from: number, to: number): void {
    this.due[to] = this.due[from];
    this.seenBy[to] = this.seenBy[from];
    this.elapsed[to] = this.elapsed[from];
    this.position.copyWithin(
      to * POSITION,
      from * POSITION,
      (from + 1) * POSITION
    );
  }

  /** A new slot builds on its first frame, before any draw has seen it. */
  clearSlot(slot: number): void {
    this.due[slot] = 0;
    this.seenBy[slot] = 1;
    this.elapsed[slot] = STALE;
    this.position.fill(0, slot * POSITION, (slot + 1) * POSITION);
  }
}

/** Seconds between pose builds at `distance` metres from the camera. */
export function poseInterval(distance: number): number {
  if (distance <= FULL_RATE_DISTANCE) return 0;
  return distance <= NEAR_RATE_DISTANCE
    ? NEAR_POSE_INTERVAL
    : FAR_POSE_INTERVAL;
}

function grownBytes(old: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(size);
  next.set(old);
  return next;
}
