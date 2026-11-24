import { SwimSettings } from './CreaturePresets';
import { wrapAngle } from './MovementSystem';
import { GAIT_NAMES, SwimGait, SwimGaits } from './SwimGaits';

export {
  BURST_GAIN,
  ESCAPE_SNAP,
  ESCAPE_SPRING,
  HOVER_SHARE,
  HOVER_SPEED,
} from './SwimGaits';
export type { SwimGait } from './SwimGaits';

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
 * Turns one fish's movement into a body wave through `SwimGaits`, and bends
 * its spine with it. It snaps into its escape C as it starts to evade.
 */
export class SwimDriver {
  private readonly gaits: SwimGaits;
  private readonly settings: SwimSettings;
  private readonly length: number;
  private readonly target: SwimTarget;
  private readonly animator: SwimAnimator | null;
  private lastHeading = 0;
  private lastMode: string | null = null;

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
    this.gaits = new SwimGaits(settings, 1, random);
  }

  get gait(): SwimGait {
    return GAIT_NAMES[this.gaits.gait[0]];
  }

  /** Radians, 0 to 2π. */
  get phase(): number {
    return this.gaits.phase[0];
  }

  /** Radians the tail swings either side. */
  get amplitude(): number {
    return this.gaits.amplitude[0];
  }

  /** Radians the spine curves from front to back, positive into a turn toward +X. */
  get curve(): number {
    return this.gaits.curve[0];
  }

  /** Tail beats a second. */
  get frequency(): number {
    return this.gaits.frequency[0];
  }

  /** Starts again from rest, facing `heading`. */
  reset(heading: number): void {
    this.lastHeading = heading;
    this.lastMode = null;
    this.gaits.reset(0);
  }

  update(dt: number, source: SwimSource): void {
    if (dt <= 0) return;
    const turn = wrapAngle(source.heading - this.lastHeading) / dt;
    this.lastHeading = source.heading;

    const mode = source.activeMode;
    if (
      mode === 'evade' &&
      this.lastMode !== 'evade' &&
      !source.stranded &&
      this.gaits.escape(0, turn)
    )
      this.dash();
    this.lastMode = mode;

    if (
      this.gaits.step(0, dt, source.speed, turn, this.length, source.stranded)
    )
      this.dash();

    this.target.setChainWave(this.phase, this.amplitude, this.curve, 1);
  }

  private dash(): void {
    const dash = this.settings.dash;
    if (dash) this.animator?.play(dash.meaning);
  }
}
