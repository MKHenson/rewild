import { SwimSettings } from './CreaturePresets';

/** m/s below which a fish hovers. */
export const HOVER_SPEED = 0.2;
/** Part of the cruise amplitude a hovering fish beats with. */
export const HOVER_SHARE = 0.25;
/** How much harder a burst or an escape beats than a steady cruise, in amplitude and rate. */
export const BURST_GAIN = 1.3;
/** Seconds the body takes to snap into its escape C. */
export const ESCAPE_SNAP = 0.05;
/** Seconds the body takes to spring back out of it. */
export const ESCAPE_SPRING = 0.1;
/** Seconds the amplitude takes to settle on a new gait. */
const AMPLITUDE_SMOOTHING = 0.15;
/** Seconds the turn curve takes to settle. */
const CURVE_SMOOTHING = 0.2;

const TWO_PI = Math.PI * 2;

export const GAIT_HOVER = 0;
export const GAIT_CRUISE = 1;
export const GAIT_BURST = 2;
export const GAIT_COAST = 3;
export const GAIT_ESCAPE = 4;

export type SwimGait = 'hover' | 'cruise' | 'burst' | 'coast' | 'escape';
export const GAIT_NAMES: readonly SwimGait[] = [
  'hover',
  'cruise',
  'burst',
  'coast',
  'escape',
];

/**
 * The body waves of many fish of one kind, in flat arrays by member. Each
 * step turns a member's speed and turn rate into how fast its tail beats, how
 * far it swings and how its spine curves. The phase builds up step by step,
 * so a change in speed never makes the tail jump. Cruising members burst and
 * coast by turns when the settings say so, and `escape` snaps one into a C.
 */
export class SwimGaits {
  readonly gait: Uint8Array;
  /** Radians, 0 to 2π. */
  readonly phase: Float32Array;
  /** Radians the tail swings either side. */
  readonly amplitude: Float32Array;
  /** Radians the spine curves from front to back, positive into a turn toward +X. */
  readonly curve: Float32Array;
  /** Tail beats a second. */
  readonly frequency: Float32Array;

  private readonly timer: Float64Array;
  private readonly beatsLeft: Int16Array;
  private readonly escapeSign: Int8Array;
  private dashed = false;

  constructor(
    readonly settings: SwimSettings,
    count: number,
    private readonly random: () => number = Math.random
  ) {
    const n = Math.max(1, count);
    this.gait = new Uint8Array(n);
    this.phase = new Float32Array(n);
    this.amplitude = new Float32Array(n);
    this.curve = new Float32Array(n);
    this.frequency = new Float32Array(n);
    this.timer = new Float64Array(n);
    this.beatsLeft = new Int16Array(n);
    this.escapeSign = new Int8Array(n);
    for (let i = 0; i < n; i++) this.phase[i] = random() * TWO_PI;
  }

  /** Member `i` at rest, hovering, keeping its phase. */
  reset(i: number): void {
    this.gait[i] = GAIT_HOVER;
    this.amplitude[i] = 0;
    this.curve[i] = 0;
    this.frequency[i] = 0;
  }

  /**
   * Snaps member `i` into its escape C, bending into a turn of sign `turn`,
   * or either way by chance when 0. False when the settings have no escape.
   */
  escape(i: number, turn: number): boolean {
    if (!this.settings.escape) return false;
    this.gait[i] = GAIT_ESCAPE;
    this.timer[i] = 0;
    this.escapeSign[i] =
      turn > 0 ? 1 : turn < 0 ? -1 : this.random() < 0.5 ? -1 : 1;
    return true;
  }

  /**
   * Steps member `i`, `length` metres long, moving at `speed` m/s and turning
   * at `turn` rad/s. True when a burst starts and the settings' dash
   * chance comes up.
   */
  step(
    i: number,
    dt: number,
    speed: number,
    turn: number,
    length: number,
    stranded: boolean
  ): boolean {
    const { settings } = this;
    this.dashed = false;
    const cruiseBeat = Math.max(settings.hoverBeat, speed / settings.stride);
    let amplitude = settings.amplitude;
    let frequency = cruiseBeat;
    // The arc the path takes over the body's length, so the body lies along it.
    const limit = settings.turnCurve;
    let curve = Math.max(
      -limit,
      Math.min(limit, (length * turn) / Math.max(speed, HOVER_SPEED))
    );
    let snapCurve = false;

    if (stranded) {
      this.gait[i] = GAIT_HOVER;
      amplitude = 0;
      frequency = 0;
      curve = 0;
    } else if (this.gait[i] === GAIT_ESCAPE) {
      this.timer[i] += dt;
      const t = this.timer[i];
      const bend = settings.escape! * this.escapeSign[i];
      amplitude *= BURST_GAIN;
      frequency *= BURST_GAIN;
      snapCurve = true;
      if (t < ESCAPE_SNAP) curve = (bend * t) / ESCAPE_SNAP;
      else if (t < ESCAPE_SNAP + ESCAPE_SPRING)
        curve = bend * (1 - (t - ESCAPE_SNAP) / ESCAPE_SPRING);
      else {
        snapCurve = false;
        this.startMoving(i, false);
      }
    } else if (speed < HOVER_SPEED) {
      this.gait[i] = GAIT_HOVER;
      amplitude *= HOVER_SHARE;
      frequency = settings.hoverBeat;
    } else {
      if (this.gait[i] === GAIT_HOVER) this.startMoving(i, true);
      if (this.gait[i] === GAIT_BURST) {
        amplitude *= BURST_GAIN;
        frequency *= BURST_GAIN;
      } else if (this.gait[i] === GAIT_COAST) {
        amplitude = 0;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.startBurst(i, true);
      }
    }

    this.frequency[i] = Math.min(frequency, settings.maxBeat);
    this.amplitude[i] +=
      (amplitude - this.amplitude[i]) * ease(dt, AMPLITUDE_SMOOTHING);
    this.curve[i] = snapCurve
      ? curve
      : this.curve[i] + (curve - this.curve[i]) * ease(dt, CURVE_SMOOTHING);

    let phase = this.phase[i] + TWO_PI * this.frequency[i] * dt;
    if (phase >= TWO_PI) {
      phase %= TWO_PI;
      if (this.gait[i] === GAIT_BURST && --this.beatsLeft[i] <= 0)
        this.startCoast(i);
    }
    this.phase[i] = phase;
    return this.dashed;
  }

  private startMoving(i: number, mayDash: boolean): void {
    if (this.settings.burst) this.startBurst(i, mayDash);
    else this.gait[i] = GAIT_CRUISE;
  }

  private startBurst(i: number, mayDash: boolean): void {
    const [min, max] = this.settings.burst!.beats;
    this.gait[i] = GAIT_BURST;
    this.beatsLeft[i] = Math.round(min + this.random() * (max - min));
    const dash = this.settings.dash;
    if (mayDash && dash && this.random() < dash.chance) this.dashed = true;
  }

  private startCoast(i: number): void {
    const [min, max] = this.settings.burst!.coast;
    this.gait[i] = GAIT_COAST;
    this.timer[i] = min + this.random() * (max - min);
  }
}

function ease(dt: number, smoothing: number): number {
  return 1 - Math.exp(-dt / smoothing);
}
