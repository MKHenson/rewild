/** Bolts alive at once on one portal. */
export const MAX_ARCS = 6;
/** Points along a bolt's main path. */
export const ARC_POINTS = 14;
/** Points along a bolt's branch, which starts at ARC_BRANCH_FROM on the path. */
export const BRANCH_POINTS = 6;
const ARC_BRANCH_FROM = 5;
const POINT_FLOATS = 3;

/** Seconds between bursts, at least and at most. */
const BURST_EVERY: readonly [number, number] = [0.15, 1.1];
/** Bolts in a burst, at most. */
const BURST_SIZE = 3;
/** Seconds a bolt lives, at least and at most. */
const ARC_LIFE: readonly [number, number] = [0.1, 0.3];
/** How far past the surface a bolt reaches, in portal radii. */
const ARC_REACH: readonly [number, number] = [0.4, 1.4];
/** How far a bolt's path wanders from straight, as a share of its length. */
const ARC_JAGGED = 0.18;
/** Seconds between re-jitters of a live bolt's path, so it crackles. */
const CRACKLE_EVERY = 1 / 30;
/** A branch's length as a share of its bolt's. */
const BRANCH_LENGTH = 0.45;

/**
 * Bolts of lightning that crack out of a portal's surface in short bursts.
 * Each bolt is a jagged path from a random point on the sphere out past it,
 * with one branch, re-jittered as it lives so it crackles, and fades out over
 * its life. `flash` sums the live bolts' brightness, for a light to follow.
 *
 * Everything is held in preallocated arrays: updating allocates nothing.
 */
export class PortalArcs {
  /** Main paths, ARC_POINTS xyz points per bolt, in world space. */
  readonly paths = new Float32Array(MAX_ARCS * ARC_POINTS * POINT_FLOATS);
  /** Branches, BRANCH_POINTS xyz points per bolt, in world space. */
  readonly branches = new Float32Array(MAX_ARCS * BRANCH_POINTS * POINT_FLOATS);
  /** Each bolt's brightness now, 0 when it is not alive. */
  readonly brightness = new Float32Array(MAX_ARCS);

  private readonly age = new Float32Array(MAX_ARCS);
  private readonly life = new Float32Array(MAX_ARCS);
  /** Whether a bolt has a path yet. */
  private readonly built = new Uint8Array(MAX_ARCS);
  /** Each bolt's start on the unit sphere, and its direction and length out. */
  private readonly starts = new Float32Array(MAX_ARCS * 3);
  private readonly ends = new Float32Array(MAX_ARCS * 3);
  private readonly branchEnds = new Float32Array(MAX_ARCS * 3);
  private nextBurst = 0;
  private sinceCrackle = 0;
  private _flash = 0;
  /** Whether new bolts crack out. Live ones finish either way. */
  spawning = true;
  /** How many times more often bursts come than BURST_EVERY. */
  rate = 1;

  constructor(private readonly random: () => number = Math.random) {
    this.nextBurst = this.between(BURST_EVERY);
  }

  /** The live bolts' brightness summed. */
  get flash(): number {
    return this._flash;
  }

  /** Advances by `seconds`, about a portal at (x, y, z) of `radius`. */
  update(seconds: number, x: number, y: number, z: number, radius: number) {
    this.nextBurst -= seconds * this.rate;
    if (this.spawning && this.nextBurst <= 0) {
      this.nextBurst = this.between(BURST_EVERY);
      const size = 1 + Math.floor(this.random() * BURST_SIZE);
      for (let i = 0; i < size; i++) this.spawn();
    }

    this.sinceCrackle += seconds;
    const crackle = this.sinceCrackle >= CRACKLE_EVERY;
    if (crackle) this.sinceCrackle = 0;

    let flash = 0;
    for (let i = 0; i < MAX_ARCS; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += seconds;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        this.brightness[i] = 0;
        continue;
      }
      const fade = (1 - t) * Math.sqrt(1 - t);
      this.brightness[i] = fade * (0.6 + 0.4 * this.random());
      flash += this.brightness[i];
      if (crackle || !this.built[i]) {
        this.buildPath(i, x, y, z, radius);
        this.built[i] = 1;
      }
    }
    this._flash = flash;
  }

  /** Cracks out `count` bolts at once, as many as there is room for. */
  burst(count: number = MAX_ARCS): void {
    for (let i = 0; i < count; i++) this.spawn();
  }

  private between(range: readonly [number, number]): number {
    return range[0] + (range[1] - range[0]) * this.random();
  }

  private spawn() {
    let slot = -1;
    for (let i = 0; i < MAX_ARCS; i++)
      if (this.life[i] <= 0) {
        slot = i;
        break;
      }
    if (slot < 0) return;

    this.age[slot] = 0;
    this.life[slot] = this.between(ARC_LIFE);
    this.built[slot] = 0;

    const s = slot * 3;
    this.randomUnit(this.starts, s);
    const reach = this.between(ARC_REACH);
    this.randomUnit(this.ends, s);
    this.randomUnit(this.branchEnds, s);
    for (let k = 0; k < 3; k++) {
      this.ends[s + k] =
        this.starts[s + k] * (1 + reach) + this.ends[s + k] * reach * 0.6;
      this.branchEnds[s + k] = this.branchEnds[s + k] * reach * BRANCH_LENGTH;
    }
  }

  // Writes a random unit vector into `out` at `at`.
  private randomUnit(out: Float32Array, at: number) {
    const z = this.random() * 2 - 1;
    const angle = this.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    out[at] = r * Math.cos(angle);
    out[at + 1] = z;
    out[at + 2] = r * Math.sin(angle);
  }

  private buildPath(
    i: number,
    x: number,
    y: number,
    z: number,
    radius: number
  ) {
    const s = i * 3;
    const sx = this.starts[s] * radius;
    const sy = this.starts[s + 1] * radius;
    const sz = this.starts[s + 2] * radius;
    const ex = this.ends[s] * radius;
    const ey = this.ends[s + 1] * radius;
    const ez = this.ends[s + 2] * radius;
    const length = Math.hypot(ex - sx, ey - sy, ez - sz);

    const path = this.paths;
    const p = i * ARC_POINTS * POINT_FLOATS;
    this.jag(path, p, ARC_POINTS, sx, sy, sz, ex, ey, ez, length, x, y, z);

    const from = p + ARC_BRANCH_FROM * POINT_FLOATS;
    const bx = path[from] - x;
    const by = path[from + 1] - y;
    const bz = path[from + 2] - z;
    const branchLength = length * BRANCH_LENGTH;
    this.jag(
      this.branches,
      i * BRANCH_POINTS * POINT_FLOATS,
      BRANCH_POINTS,
      bx,
      by,
      bz,
      bx + this.branchEnds[s] * radius,
      by + this.branchEnds[s + 1] * radius,
      bz + this.branchEnds[s + 2] * radius,
      branchLength,
      x,
      y,
      z
    );
  }

  // Writes `count` points from a to b, offset by (x, y, z), each but the ends
  // pushed off the line by up to ARC_JAGGED of `length`, most in the middle.
  private jag(
    out: Float32Array,
    at: number,
    count: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    length: number,
    x: number,
    y: number,
    z: number
  ) {
    const last = count - 1;
    for (let k = 0; k < count; k++) {
      const t = k / last;
      const wander =
        k === 0 || k === last ? 0 : ARC_JAGGED * length * Math.sin(Math.PI * t);
      const o = at + k * POINT_FLOATS;
      out[o] = x + ax + (bx - ax) * t + wander * (this.random() * 2 - 1);
      out[o + 1] = y + ay + (by - ay) * t + wander * (this.random() * 2 - 1);
      out[o + 2] = z + az + (bz - az) * t + wander * (this.random() * 2 - 1);
    }
  }
}
