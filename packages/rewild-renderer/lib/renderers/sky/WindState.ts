/** A forced wind: strength 0..1 and a bearing in degrees the air moves
 *  toward, 0 = +x, 90 = +z. */
export interface WindOverride {
  strength: number;
  bearing: number;
}

/**
 * The wind as the things it moves read it, resolved once at the top of the
 * frame from the weather: `vec` is xy the world-space direction the air moves,
 * z the strength 0..1, w a clock that runs at the strength — so a sway keyed
 * off it slows in a calm and quickens in a gale without its phase jumping
 * when the weather changes, which scaling a frequency by the strength in the
 * shader would do.
 *
 * The weather's `windDirection` is where the clouds and rain are advected
 * *from* — both sample their fields at position + windDirection, so what the
 * eye sees drifts the opposite way. The direction here is what the eye sees.
 */
export class WindState {
  readonly vec = new Float32Array([-1, 0, 0, 0]);
  /** Forces the wind regardless of the weather, for tuning what it moves
   *  without waiting for a storm. Null follows the weather. */
  override: WindOverride | null = null;

  update(
    windDirectionX: number,
    windDirectionZ: number,
    windiness: number,
    deltaSeconds: number
  ): void {
    const vec = this.vec;

    if (this.override) {
      const radians = (this.override.bearing * Math.PI) / 180;
      vec[0] = Math.cos(radians);
      vec[1] = Math.sin(radians);
      vec[2] = Math.min(1, Math.max(0, this.override.strength));
    } else {
      const length = Math.hypot(windDirectionX, windDirectionZ);
      vec[0] = length > 0 ? -windDirectionX / length : -1;
      vec[1] = length > 0 ? -windDirectionZ / length : 0;
      vec[2] = Math.min(1, Math.max(0, windiness));
    }

    vec[3] += deltaSeconds * vec[2];
  }
}
