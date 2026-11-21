import { SwimSettings } from './CreaturePresets';
import { wrapAngle } from './MovementSystem';

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

export type SwimGait = 'hover' | 'cruise' | 'burst' | 'coast' | 'escape';

/** The movement values the driver reads. MovementSystem is one. */
export interface SwimSource {
  readonly speed: number;
  readonly heading: number;
  readonly stranded: boolean;
  readonly activeMode: string | null;
}

/** What the driver bends. SkinnedInstance is one. */
export interface SwimTarget {
  setChainWave(
    phase: number,
    amplitude: number,
    curve: number,
    weight: number
  ): void;
}

/** Plays the driver's one-shot actions. AnimationController is one. */
export interface SwimAnimator {
  play(meaning: string): boolean;
}

/**
 * Turns a fish's movement into a body wave: how fast the tail beats, how far
 * it swings, and how the spine curves into a turn. The beat rate follows the
 * speed, and the phase builds up frame by frame, so a change in speed never
 * makes the tail jump.
 */
export class SwimDriver {
  gait: SwimGait = 'hover';
  /** Radians, 0 to 2π. */
  phase = 0;
  /** Radians the tail swings either side. */
  amplitude = 0;
  /** Radians the spine curves from front to back, positive into a turn toward +X. */
  curve = 0;
  /** Tail beats a second. */
  frequency = 0;

  private readonly settings: SwimSettings;
  private readonly length: number;
  private readonly target: SwimTarget;
  private readonly animator: SwimAnimator | null;
  private readonly random: () => number;
  private lastHeading = 0;
  private lastMode: string | null = null;
  private timer = 0;
  private beatsLeft = 0;
  private escapeSign = 1;

  /** `length` is the bent chain's length in metres. */
  constructor(
    settings: SwimSettings,
    length: number,
    target: SwimTarget,
    animator: SwimAnimator | null = null,
    random: () => number = Math.random
  ) {
    this.settings = settings;
    this.length = length;
    this.target = target;
    this.animator = animator;
    this.random = random;
    this.phase = random() * TWO_PI;
  }

  /** Starts again from rest, facing `heading`. */
  reset(heading: number): void {
    this.lastHeading = heading;
    this.lastMode = null;
    this.gait = 'hover';
    this.amplitude = 0;
    this.curve = 0;
    this.frequency = 0;
  }

  update(dt: number, source: SwimSource): void {
    if (dt <= 0) return;
    const { settings } = this;
    const turn = wrapAngle(source.heading - this.lastHeading) / dt;
    this.lastHeading = source.heading;

    const mode = source.activeMode;
    if (
      settings.escape &&
      mode === 'evade' &&
      this.lastMode !== 'evade' &&
      !source.stranded
    ) {
      this.gait = 'escape';
      this.timer = 0;
      this.escapeSign =
        turn > 0 ? 1 : turn < 0 ? -1 : this.random() < 0.5 ? -1 : 1;
      this.dash();
    }
    this.lastMode = mode;

    const cruiseBeat = Math.max(
      settings.hoverBeat,
      source.speed / settings.stride
    );
    let amplitude = settings.amplitude;
    let frequency = cruiseBeat;
    // The arc the path takes over the body's length, so the body lies along it.
    const limit = settings.turnCurve;
    let curve = Math.max(
      -limit,
      Math.min(
        limit,
        (this.length * turn) / Math.max(source.speed, HOVER_SPEED)
      )
    );
    let snapCurve = false;

    if (source.stranded) {
      this.gait = 'hover';
      amplitude = 0;
      frequency = 0;
      curve = 0;
    } else if (this.gait === 'escape') {
      this.timer += dt;
      const t = this.timer;
      const bend = settings.escape! * this.escapeSign;
      amplitude *= BURST_GAIN;
      frequency *= BURST_GAIN;
      snapCurve = true;
      if (t < ESCAPE_SNAP) curve = (bend * t) / ESCAPE_SNAP;
      else if (t < ESCAPE_SNAP + ESCAPE_SPRING)
        curve = bend * (1 - (t - ESCAPE_SNAP) / ESCAPE_SPRING);
      else {
        snapCurve = false;
        this.startMoving(false);
      }
    } else if (source.speed < HOVER_SPEED) {
      this.gait = 'hover';
      amplitude *= HOVER_SHARE;
      frequency = settings.hoverBeat;
    } else {
      if (this.gait === 'hover') this.startMoving(true);
      if (this.gait === 'burst') {
        amplitude *= BURST_GAIN;
        frequency *= BURST_GAIN;
      } else if (this.gait === 'coast') {
        amplitude = 0;
        this.timer -= dt;
        if (this.timer <= 0) this.startBurst(true);
      }
    }

    this.frequency = Math.min(frequency, settings.maxBeat);
    this.amplitude +=
      (amplitude - this.amplitude) * ease(dt, AMPLITUDE_SMOOTHING);
    this.curve = snapCurve
      ? curve
      : this.curve + (curve - this.curve) * ease(dt, CURVE_SMOOTHING);

    this.phase += TWO_PI * this.frequency * dt;
    if (this.phase >= TWO_PI) {
      this.phase %= TWO_PI;
      if (this.gait === 'burst' && --this.beatsLeft <= 0) this.startCoast();
    }

    this.target.setChainWave(this.phase, this.amplitude, this.curve, 1);
  }

  private startMoving(mayDash: boolean): void {
    if (this.settings.burst) this.startBurst(mayDash);
    else this.gait = 'cruise';
  }

  private startBurst(mayDash: boolean): void {
    const [min, max] = this.settings.burst!.beats;
    this.gait = 'burst';
    this.beatsLeft = Math.round(min + this.random() * (max - min));
    const dash = this.settings.dash;
    if (mayDash && dash && this.random() < dash.chance) this.dash();
  }

  private dash(): void {
    const dash = this.settings.dash;
    if (dash) this.animator?.play(dash.meaning);
  }

  private startCoast(): void {
    const [min, max] = this.settings.burst!.coast;
    this.gait = 'coast';
    this.timer = min + this.random() * (max - min);
  }
}

function ease(dt: number, smoothing: number): number {
  return 1 - Math.exp(-dt / smoothing);
}
