import { smoothstep } from 'rewild-common';

/** Seconds by e the body takes to follow the weather. */
export const BODY_EASE = 10;
/** Seconds by e a wet body takes to dry. */
export const DRY_TIME = 45;

/**
 * 0..1: how hot the weather makes the body. Hot air with the sun up, more so
 * when worn out.
 * @param temperature The sky's 0..1.
 * @param sun         The sun's height, -1..1.
 * @param exertion    0..1: how worn out the player is.
 */
export function heatTarget(
  temperature: number,
  sun: number,
  exertion: number
): number {
  const hot = smoothstep(temperature, 0.7, 0.95) * smoothstep(sun, 0, 0.4);
  return Math.min(1, hot * (0.8 + 0.4 * exertion));
}

/**
 * 0..1: how cold the weather makes the body. Cold air, made worse by wind,
 * falling snow and a wet body.
 * @param temperature The sky's 0..1.
 * @param snow        0..1: how hard snow falls.
 * @param wet         0..1: how wet the body is.
 */
export function coldTarget(
  temperature: number,
  windiness: number,
  snow: number,
  wet: number
): number {
  const chill = 1 - smoothstep(temperature, 0.05, 0.3);
  const wetChill = wet * (1 - smoothstep(temperature, 0.3, 0.55)) * 0.5;
  return Math.min(1, chill * (1 + 0.4 * windiness) + 0.3 * snow + wetChill);
}

/**
 * How hot or cold the player's body is: 0 is normal, 1 really hot and -1
 * really cold. It eases toward what the weather makes it over several
 * seconds. A swim soaks the body and rain wets it; it dries slowly after.
 */
export class BodyTemperature {
  value = 0;
  /** While set, the value stays where it was put and ignores the weather. */
  held = false;
  /** 0..1: how wet the body is. */
  wet = 0;

  /** 0..1: how hot the body is. */
  get heat(): number {
    return this.value > 0 ? this.value : 0;
  }

  /** 0..1: how cold the body is. */
  get cold(): number {
    return this.value < 0 ? -this.value : 0;
  }

  reset(): void {
    this.value = 0;
    this.wet = 0;
    this.held = false;
  }

  /**
   * @param temperature The sky's 0..1.
   * @param sun         The sun's height, -1..1.
   * @param rain        0..1: how hard rain falls.
   * @param snow        0..1: how hard snow falls.
   * @param swimming    Whether the player swims.
   * @param exertion    0..1: how worn out the player is.
   */
  update(
    temperature: number,
    sun: number,
    windiness: number,
    rain: number,
    snow: number,
    swimming: boolean,
    exertion: number,
    seconds: number
  ): void {
    this.wet = swimming
      ? 1
      : Math.max(rain, this.wet * Math.exp(-seconds / DRY_TIME));
    if (this.held) return;
    const target =
      heatTarget(temperature, sun, exertion) -
      coldTarget(temperature, windiness, snow, this.wet);
    this.value += (target - this.value) * (1 - Math.exp(-seconds / BODY_EASE));
  }
}
