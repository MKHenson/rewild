import { smoothstep } from 'rewild-common';
import { GUST_SPEED } from './GustField';

/** A forced wind: strength 0..1 and a bearing in degrees the air moves
 *  toward, 0 = +x, 90 = +z. */
export interface WindOverride {
  strength: number;
  bearing: number;
}

/** Cloud-space units the cumulus deck drifts per second in full wind. */
const CLOUD_DRIFT_SPEED = 30.9;
/** Sheet units the cirrus scrolls per second in full wind. */
const CIRRUS_SCROLL_SPEED = 0.105;
/** Per second: how fast the upper air turns to the surface wind. */
const UPPER_TURN_RATE = 1 / 60;
/** Per second: how fast cloudFront's trend follows the cloudiness. */
const CLOUD_TREND_RATE = 0.2;
/** Seconds of the cloudiness trend that make the full upwind lean. */
const FRONT_LEAD_SECONDS = 60;
/** The most the far upwind sky leans from the cloudiness overhead. */
const FRONT_REACH = 0.25;

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
 *
 * The drifts are integrated here rather than as direction × time in the
 * shaders, so a wind that turns or strengthens moves each field on from where
 * it is instead of jumping it.
 */
export class WindState {
  readonly vec = new Float32Array([-1, 0, 0, 0]);
  /** Metres the foliage gust field has blown downwind. */
  readonly gustDrift = new Float32Array(2);
  /** How far the cumulus deck has drifted, along windDirection (the way its
   *  field is sampled), in cloud space. */
  readonly cloudDrift = new Float32Array(2);
  /** How far the cirrus sheet has scrolled along its strands. */
  cirrusScroll = 0;
  /** How the sky's cloudiness arrives: xy the upwind direction (windDirection),
   *  w how far the far upwind sky leans from the cloudiness overhead, -0.25 to
   *  0.25, from how fast the cloudiness is changing. Building cloud shows
   *  first upwind, and a clearing breaks from upwind. z is unused. */
  readonly cloudFront = new Float32Array(4);
  /** Smoothed change in cloudiness per second. */
  cloudTrend = 0;
  private lastCloudiness = NaN;
  /** The upper air's windDirection: it follows the surface wind slowly, so
   *  the cirrus does not swing with every gust. */
  readonly upperDirection = new Float32Array([1, 0]);
  private upperAngle = 0;
  private upperStarted = false;
  /** Forces the wind regardless of the weather, for tuning what it moves
   *  without waiting for a storm. Null follows the weather. */
  override: WindOverride | null = null;

  update(
    windDirectionX: number,
    windDirectionZ: number,
    windiness: number,
    cloudiness: number,
    deltaSeconds: number
  ): void {
    const vec = this.vec;
    const length = Math.hypot(windDirectionX, windDirectionZ);
    const fromX = length > 0 ? windDirectionX / length : 1;
    const fromZ = length > 0 ? windDirectionZ / length : 0;
    const strength = Math.min(1, Math.max(0, windiness));

    if (this.override) {
      const radians = (this.override.bearing * Math.PI) / 180;
      vec[0] = Math.cos(radians);
      vec[1] = Math.sin(radians);
      vec[2] = Math.min(1, Math.max(0, this.override.strength));
    } else {
      vec[0] = -fromX;
      vec[1] = -fromZ;
      vec[2] = strength;
    }

    vec[3] += deltaSeconds * vec[2];
    this.gustDrift[0] += vec[0] * vec[2] * GUST_SPEED * deltaSeconds;
    this.gustDrift[1] += vec[1] * vec[2] * GUST_SPEED * deltaSeconds;

    const storm = smoothstep(cloudiness, 0.9, 1);
    const cloudSpeed = CLOUD_DRIFT_SPEED * (1 + 2 * storm) * strength;
    this.cloudDrift[0] += fromX * cloudSpeed * deltaSeconds;
    this.cloudDrift[1] += fromZ * cloudSpeed * deltaSeconds;
    this.cirrusScroll += CIRRUS_SCROLL_SPEED * strength * deltaSeconds;

    if (deltaSeconds > 0 && !Number.isNaN(this.lastCloudiness)) {
      const rate = (cloudiness - this.lastCloudiness) / deltaSeconds;
      const follow = 1 - Math.exp(-CLOUD_TREND_RATE * deltaSeconds);
      this.cloudTrend += (rate - this.cloudTrend) * follow;
    }
    this.lastCloudiness = cloudiness;
    const lean = Math.max(-1, Math.min(1, this.cloudTrend * FRONT_LEAD_SECONDS));
    const front = this.cloudFront;
    front[0] = fromX;
    front[1] = fromZ;
    front[2] = 0;
    front[3] = lean * FRONT_REACH;

    const target = Math.atan2(fromZ, fromX);
    if (!this.upperStarted) {
      this.upperAngle = target;
      this.upperStarted = true;
    } else {
      const turn = 1 - Math.exp(-UPPER_TURN_RATE * deltaSeconds);
      let delta = (target - this.upperAngle) % (2 * Math.PI);
      if (delta > Math.PI) delta -= 2 * Math.PI;
      else if (delta < -Math.PI) delta += 2 * Math.PI;
      this.upperAngle += delta * turn;
    }
    this.upperDirection[0] = Math.cos(this.upperAngle);
    this.upperDirection[1] = Math.sin(this.upperAngle);
  }
}
