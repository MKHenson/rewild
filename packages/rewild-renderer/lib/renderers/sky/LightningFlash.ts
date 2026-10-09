import { Color } from 'rewild-common';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { Transform } from '../../core/Transform';

/** How a lightning flash lights the world. */
export interface LightningFlashSettings {
  /** Radiance of the light from the bolt at a full flash; the sun is 120. */
  light: number;
  /** Radiance of the lit cloud deck over the sky at a full flash; a clear
   *  day's sky is about 7. */
  sky: number;
  /** Glare over the screen at a full flash with the bolt straight ahead, as
   *  the eye is dazzled. 0 is none. */
  glare: number;
  /** Scale on how long the flicker lasts; 1 is about a second. */
  linger: number;
}

export const DEFAULT_LIGHTNING_FLASH: LightningFlashSettings = {
  light: 100,
  sky: 60,
  glare: 0.25,
  linger: 1,
};

// A flash's light, a cool white.
const FLASH_COLOR = new Color(0.82, 0.88, 1);

/** Strokes down the channel in one flash: the first, then up to
 *  FLICKER_STROKES − 1 more. */
export const FLICKER_STROKES = 4;
// Seconds between strokes, and each later stroke's strength over the first.
const STROKE_GAP: readonly [number, number] = [0.06, 0.2];
const STROKE_STRENGTH: readonly [number, number] = [0.35, 0.9];
// Seconds a stroke takes to rise, and to fall by e.
const STROKE_RISE = 0.012;
const STROKE_FALL = 0.07;
// The glow the clouds hold under the strokes: its share of the first stroke,
// and the seconds it fades by e.
const AFTERGLOW = 0.22;
const AFTERGLOW_FALL = 0.35;
// Seconds after which a flash is over, at a linger of 1.
const FLICKER_END = 1.4;

/** 0..1: a stroke's light `seconds` after it began, scaled by `linger`. */
export function strokeLight(seconds: number, linger: number): number {
  if (seconds < 0) return 0;
  const rise = 1 - Math.exp(-seconds / (STROKE_RISE * linger));
  return rise * Math.exp(-seconds / (STROKE_FALL * linger));
}

/**
 * 0..1: a flash's light `seconds` after its first stroke: the strokes at
 * `times` with strengths `strengths`, the first `count` of them, over an
 * afterglow that fades from the first. `linger` stretches it all.
 */
export function flickerLight(
  seconds: number,
  times: ArrayLike<number>,
  strengths: ArrayLike<number>,
  count: number,
  linger: number
): number {
  if (seconds < 0) return 0;
  let light = 0;
  for (let i = 0; i < count; i++)
    light = Math.max(
      light,
      strengths[i] * strokeLight(seconds - times[i] * linger, linger)
    );
  const glow =
    AFTERGLOW *
    (1 - Math.exp(-seconds / (STROKE_RISE * linger))) *
    Math.exp(-seconds / (AFTERGLOW_FALL * linger));
  return Math.min(1, Math.max(light, glow));
}

/** 0..1: how far ahead a strike at (`toX`, `toZ`) from the camera lies, for a
 *  camera facing (`forwardX`, `forwardZ`): 1 straight ahead, 0 abeam and
 *  behind, eased. */
export function strikeAhead(
  toX: number,
  toZ: number,
  forwardX: number,
  forwardZ: number
): number {
  const to = Math.hypot(toX, toZ);
  const forward = Math.hypot(forwardX, forwardZ);
  if (to < 1e-4 || forward < 1e-4) return 0;
  const facing = Math.max(
    0,
    (toX * forwardX + toZ * forwardZ) / (to * forward)
  );
  return facing * facing;
}

/**
 * The light of a lightning flash. A directional light from the strike, which
 * the sun's cloud and cascade shadows do not fall on, lights the faces that
 * turn toward the bolt; the lit cloud deck adds to the sky's ambient and to
 * its reflections (IblParams.flash); and a little glare dazzles the eye when
 * the bolt is in view.
 *
 * A flash flickers: when the strike's flash begins, a few strokes at random
 * gaps pulse the light over about a second, over an afterglow (flickerLight).
 * All three follow it, and nothing shows between flashes.
 */
export class LightningFlash {
  settings: LightningFlashSettings = { ...DEFAULT_LIGHTNING_FLASH };
  readonly light = new DirectionLight(FLASH_COLOR.clone(), 0);
  /** 0..1: the flicker now, times the strike's strength. */
  intensity = 0;
  /** rgb radiance of the lit cloud deck now. */
  readonly sky = new Float32Array(3);
  /** Glare over the screen now (tonemap.wgsl). */
  glare = 0;

  private seconds = Infinity;
  private peak = 0;
  private wasFlashing = false;
  private strokes = 1;
  private times = new Float32Array(FLICKER_STROKES);
  private strengths = new Float32Array(FLICKER_STROKES);

  constructor(parent: Transform, private random: () => number = Math.random) {
    this.light.shadowed = false;
    this.light.transform.visible = false;
    parent.addChild(this.light.transform);
  }

  /**
   * Advances by `deltaSeconds` under the strike's flash `flash` 0..1, from a
   * strike at world `strike`, for a camera at (`eyeX`, `eyeY`, `eyeZ`) facing
   * (`forwardX`, `forwardZ`). A flash rising from nothing starts a flicker
   * as strong as it.
   */
  update(
    deltaSeconds: number,
    flash: number,
    strike: ArrayLike<number> | null,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    forwardX: number,
    forwardZ: number
  ): void {
    const s = this.settings;
    const flashing = flash > 0 && strike !== null;
    if (flashing && !this.wasFlashing) this.begin(flash);
    else if (flashing) this.peak = Math.max(this.peak, flash);
    this.wasFlashing = flashing;

    this.seconds += deltaSeconds;
    const linger = Math.max(s.linger, 0.05);
    this.intensity =
      this.seconds < FLICKER_END * linger
        ? this.peak *
          flickerLight(
            this.seconds,
            this.times,
            this.strengths,
            this.strokes,
            linger
          )
        : 0;

    const lit = this.intensity > 1e-3 && strike !== null;
    const transform = this.light.transform;
    transform.visible = lit;
    this.light.intensity = lit ? this.intensity * s.light : 0;
    const sky = lit ? this.intensity * s.sky : 0;
    this.sky[0] = sky * FLASH_COLOR.r;
    this.sky[1] = sky * FLASH_COLOR.g;
    this.sky[2] = sky * FLASH_COLOR.b;
    if (!lit) {
      this.glare = 0;
      return;
    }
    const toX = strike[0] - eyeX;
    const toY = strike[1] - eyeY;
    const toZ = strike[2] - eyeZ;
    const length = Math.hypot(toX, toY, toZ) || 1;
    // The light travels from its position toward its target at the origin.
    transform.position.set(
      (toX / length) * 100,
      (toY / length) * 100,
      (toZ / length) * 100
    );
    this.glare =
      this.intensity * s.glare * strikeAhead(toX, toZ, forwardX, forwardZ);
  }

  // Lays out a new flicker as strong as `flash`.
  private begin(flash: number): void {
    const random = this.random;
    this.seconds = 0;
    this.peak = flash;
    this.strokes = 1 + Math.floor(random() * FLICKER_STROKES);
    this.times[0] = 0;
    this.strengths[0] = 1;
    for (let i = 1; i < this.strokes; i++) {
      const gap = STROKE_GAP[0] + (STROKE_GAP[1] - STROKE_GAP[0]) * random();
      this.times[i] = this.times[i - 1] + gap;
      this.strengths[i] =
        STROKE_STRENGTH[0] +
        (STROKE_STRENGTH[1] - STROKE_STRENGTH[0]) * random();
    }
  }
}
