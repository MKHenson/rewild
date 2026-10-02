import { smoothstep } from 'rewild-common';

// Drops on the camera's lens (water-lens.wgsl draws them): left on surfacing,
// and landing in rain. Small drops cling and evaporate; large ones hang a
// moment, then slide down, leaving a thin wet trail that dries behind them.
// Each drop ages on its own, so rain can add drops while others dry. Going
// under clears the lens. Sizes and positions are fractions of the frame's
// height and size, y down.

/** Most drops on the lens at once. */
export const MAX_DROPS = 512;
/** Floats per drop in `data`: Drop in water-lens.wgsl. */
export const DROP_FLOATS = 8;
/** Drops left on surfacing. */
export const SURFACING_DROPS = 240;
/** Seconds after surfacing by which the lens is dry. */
export const LENS_DRY_SECONDS = 9;
/** Drops a second rain lands on the lens at full strength. */
export const RAIN_DROPS_PER_SECOND = 150;

interface DropKind {
  /** Share of the drops that are large enough to slide. */
  largeShare: number;
  /** Radii over the frame's height, small and large. */
  small: readonly [number, number];
  large: readonly [number, number];
  /** Seconds a small drop lasts, and a large one. */
  smallLife: readonly [number, number];
  largeLife: number;
}

const SURFACING: DropKind = {
  largeShare: 0.3,
  small: [0.004, 0.012],
  large: [0.015, 0.035],
  smallLife: [2.5, LENS_DRY_SECONDS],
  largeLife: LENS_DRY_SECONDS,
};

// Rain lands as smaller, shorter-lived drops; a few gather enough to slide.
const RAIN: DropKind = {
  largeShare: 0.12,
  small: [0.003, 0.009],
  large: [0.012, 0.024],
  smallLife: [1.5, 4],
  largeLife: 6,
};

// A drop fades over the last FADE_SHARE of its life, and shrinks by SHRINK
// of its radius as it evaporates.
const FADE_SHARE = 0.4;
const SHRINK = 0.3;
// Seconds a large drop hangs before it slides; its slide accelerates by
// SLIDE_ACCELERATION frame heights a second each second, up to SLIDE_SPEED.
const HANG = [0.3, 2.8];
const SLIDE_ACCELERATION = 0.7;
const SLIDE_SPEED = 0.7;
// The trail's opacity as it is laid, the seconds over which it dries by e,
// and the longest it gets over the frame's height.
const TRAIL_OPACITY = 1.0;
const TRAIL_DRY = 2.5;
const TRAIL_MAX = 0.6;

export class LensDrops {
  /** Drop structs for the GPU, the live ones first. */
  readonly data = new Float32Array(MAX_DROPS * DROP_FLOATS);
  /** Drops live in `data`. */
  count = 0;
  private alive = new Uint8Array(MAX_DROPS);
  private age = new Float32Array(MAX_DROPS);
  private life = new Float32Array(MAX_DROPS);
  private x = new Float32Array(MAX_DROPS);
  private y = new Float32Array(MAX_DROPS);
  private radius = new Float32Array(MAX_DROPS);
  private hang = new Float32Array(MAX_DROPS);
  private speed = new Float32Array(MAX_DROPS);
  private trail = new Float32Array(MAX_DROPS);
  private seed = new Float32Array(MAX_DROPS);
  // Fractions of a rain drop carried from frame to frame.
  private rainCarry = 0;
  // Share of the drops kept (WaterQuality): the slots in use, those left on
  // surfacing and the rain's rate.
  private share = 1;
  private slots = MAX_DROPS;

  constructor(private random: () => number = Math.random) {}

  /** Keeps `share` 0..1 of the drops: fewer on lower quality tiers. Drops
   *  already on the lens past the new pool dry as usual. */
  setShare(share: number): void {
    this.share = Math.min(1, Math.max(0, share));
    this.slots = Math.max(1, Math.round(MAX_DROPS * this.share));
  }

  /** Whether any drop is on the lens. */
  get wet(): boolean {
    return this.count > 0;
  }

  /** Leaves fresh drops over the whole lens, as on surfacing. */
  surface(): void {
    this.alive.fill(0);
    const count = Math.min(
      this.slots,
      Math.round(SURFACING_DROPS * this.share)
    );
    for (let i = 0; i < count; i++) this.spawn(i, SURFACING);
    this.pack();
  }

  /** Clears the lens, as on going under. */
  clear(): void {
    this.alive.fill(0);
    this.rainCarry = 0;
    this.count = 0;
  }

  /** Lands rain on the lens for `seconds` at `strength` 0..1, in free slots. */
  rain(strength: number, seconds: number): void {
    if (strength <= 0) {
      this.rainCarry = 0;
      return;
    }
    this.rainCarry += RAIN_DROPS_PER_SECOND * this.share * strength * seconds;
    for (let i = 0; i < this.slots && this.rainCarry >= 1; i++) {
      if (this.alive[i]) continue;
      this.spawn(i, RAIN);
      this.rainCarry -= 1;
    }
    this.rainCarry = Math.min(this.rainCarry, 1);
    this.pack();
  }

  /** Advances every drop by `seconds` and packs the live ones. */
  update(seconds: number): void {
    if (this.count === 0) return;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.alive[i]) continue;
      const age = (this.age[i] += seconds);
      if (age >= this.life[i]) {
        this.alive[i] = 0;
        continue;
      }
      if (age >= this.hang[i]) {
        this.speed[i] = Math.min(
          this.speed[i] + SLIDE_ACCELERATION * seconds,
          SLIDE_SPEED
        );
        const step = this.speed[i] * seconds;
        this.y[i] += step;
        this.trail[i] = Math.min(this.trail[i] + step, TRAIL_MAX);
        if (this.y[i] - this.radius[i] > 1) this.alive[i] = 0;
      }
    }
    this.pack();
  }

  private spawn(i: number, kind: DropKind): void {
    const random = this.random;
    const large = random() < kind.largeShare;
    const range = large ? kind.large : kind.small;
    this.alive[i] = 1;
    this.age[i] = 0;
    this.x[i] = random();
    this.y[i] = random();
    this.radius[i] = range[0] + (range[1] - range[0]) * random();
    this.life[i] = large
      ? kind.largeLife
      : kind.smallLife[0] + (kind.smallLife[1] - kind.smallLife[0]) * random();
    this.hang[i] = large ? HANG[0] + (HANG[1] - HANG[0]) * random() : Infinity;
    this.speed[i] = 0;
    this.trail[i] = 0;
    this.seed[i] = random();
  }

  private pack(): void {
    const d = this.data;
    let n = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.alive[i]) continue;
      const age = this.age[i];
      const life = this.life[i];
      const fadeStart = life * (1 - FADE_SHARE);
      const sliding = Math.max(age - this.hang[i], 0);
      const o = n * DROP_FLOATS;
      d[o] = this.x[i];
      d[o + 1] = this.y[i];
      d[o + 2] = this.radius[i] * (1 - SHRINK * Math.min(age / life, 1));
      d[o + 3] = 1 - smoothstep(age, fadeStart, life);
      d[o + 4] = this.trail[i];
      d[o + 5] = TRAIL_OPACITY * Math.exp(-sliding / TRAIL_DRY);
      d[o + 6] = this.seed[i];
      d[o + 7] = this.speed[i] / SLIDE_SPEED;
      n++;
    }
    this.count = n;
  }
}
