import { DayPeriod } from './WeatherTypes';

const MIN_SHARE = 0.05;

/**
 * Moves the sun. Elevation is in degrees and unwrapped: 0 to 180 is day, 180
 * to 360 night. `dayShare` is the part of the cycle the sun is up, so the sun
 * crosses the sky and the night at different speeds when it is not a half.
 */
export class DayNightCycle {
  elevation = 80;
  /** Seconds for one full day and night. */
  cycleSeconds = 300;
  dayShare = 0.5;
  paused = false;
  /** Scale on the cycle's speed, for tuning. */
  timeScale = 1;

  advance(deltaSeconds: number): void {
    if (this.paused) return;
    this.elevation = this.elevationAfter(deltaSeconds * this.timeScale);
  }

  /** The elevation `seconds` from now, with the cycle running. */
  elevationAfter(seconds: number): number {
    let elevation = this.elevation;
    let remaining = seconds;
    for (let i = 0; i < 64 && remaining > 0; i++) {
      const phase = wrapDegrees(elevation);
      const rate = this.rateAt(phase);
      const boundary = phase < 180 ? 180 - phase : 360 - phase;
      const toBoundary = boundary / rate;
      if (remaining < toBoundary) return elevation + rate * remaining;
      elevation += boundary;
      remaining -= toBoundary;
    }
    return elevation;
  }

  /** Degrees per second at the current elevation; 0 while paused. */
  get degreesPerSecond(): number {
    if (this.paused) return 0;
    return this.rateAt(wrapDegrees(this.elevation)) * this.timeScale;
  }

  private rateAt(phase: number): number {
    const share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, this.dayShare));
    const part = phase < 180 ? share : 1 - share;
    return 180 / (Math.max(1, this.cycleSeconds) * part);
  }
}

export function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function dayPeriod(elevation: number): DayPeriod {
  const phase = wrapDegrees(elevation);
  if (phase < 90) return 'morning';
  if (phase < 180) return 'afternoon';
  if (phase < 270) return 'evening';
  return 'night';
}

export function isDawn(elevation: number): boolean {
  const phase = wrapDegrees(elevation);
  return phase >= 340 || phase < 20;
}

export function isDusk(elevation: number): boolean {
  const phase = wrapDegrees(elevation);
  return phase >= 160 && phase < 200;
}

/** -1 at the nadir, 0 at the horizon, 1 at the zenith. */
export function sunHeight(elevation: number): number {
  return Math.sin((elevation * Math.PI) / 180);
}
