import { Color, degToRad, smoothstep, Vector3 } from 'rewild-common';

/** Degrees the moon's path tilts off the sun's, so a new moon passes beside
 *  the sun rather than across it. */
const INCLINATION = 5;

/** sin(sun elevation) where moonlight starts, just below where the sun's
 *  light has gone (SkyRenderer's nightFade), and where it reaches full. */
const NIGHT_START = -0.12;
const NIGHT_FULL = -0.2;

export const MOON_COLOR = new Color(0.78, 0.86, 1.0);

/** Wraps a phase into 0..1. */
export function wrapPhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

/** Fraction of the disc in sunlight: 0 at new, 1 at full. */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(wrapPhase(phase) * Math.PI * 2)) / 2;
}

/** Degrees the moon trails the sun along its path: 0 at new, 180 at full. */
export function moonElongation(phase: number): number {
  return wrapPhase(phase) * 360;
}

/**
 * The moon's place and the light it throws. It follows the sun's path,
 * trailing it by the phase, so a full moon rises as the sun sets and a first
 * quarter stands overhead at dusk. Its light scales with the lit share of the
 * disc and only comes on once the sun's has gone.
 */
export class Moon {
  /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase = 0.5;
  /** Angular radius of the disc in degrees. */
  size = 1.9;
  /** Light intensity of a full moon high in a dark sky. */
  baseIntensity = 18;
  /** Sky radiance of the lit disc at night. */
  nightRadiance = 10;
  /** Sky radiance of the lit disc in daylight, faint against the blue. */
  dayRadiance = 2.5;

  /** Day/night cycles from one new moon to the next. */
  daysPerCycle = 8;

  /** Unit vector toward the moon. */
  readonly direction = new Vector3();
  /** The moon's light now, before cloud. */
  intensity = 0;

  /** Moves the phase on as the sun travels `sunDegrees` along its path. */
  advance(sunDegrees: number): void {
    const days = Math.max(1, this.daysPerCycle);
    this.phase = wrapPhase(this.phase + sunDegrees / (360 * days));
  }

  /**
   * Places the moon for a sun at unwrapped `sunElevation` degrees on a path
   * of bearing `azimuth`, and sets its light.
   */
  update(sunElevation: number, azimuth: number): void {
    const elevation = degToRad(sunElevation - moonElongation(this.phase));
    const theta = degToRad(azimuth);
    const tilt = degToRad(INCLINATION);

    const hx = Math.sin(theta);
    const hz = Math.cos(theta);
    const sinTilt = Math.sin(tilt);
    const cosTilt = Math.cos(tilt);
    const sinE = Math.sin(elevation);
    const cosE = Math.cos(elevation);

    // The sun's path spans the horizon bearing h and up; tilting up toward
    // h × up keeps the rising and setting points the same.
    this.direction.set(
      hx * cosE - hz * sinTilt * sinE,
      cosTilt * sinE,
      hz * cosE + hx * sinTilt * sinE
    );

    const sunUp = Math.sin(degToRad(sunElevation));
    const night = smoothstep(-sunUp, -NIGHT_START, -NIGHT_FULL);
    const risen = smoothstep(this.direction.y, -0.12, 0.0);
    const illumination = moonIllumination(this.phase);

    this.intensity =
      this.baseIntensity * illumination * illumination * night * risen;
  }

  /** Whether the moon, not the sun, should be the key light. */
  isKeyLight(sunElevation: number): boolean {
    return Math.sin(degToRad(sunElevation)) < NIGHT_START;
  }
}
