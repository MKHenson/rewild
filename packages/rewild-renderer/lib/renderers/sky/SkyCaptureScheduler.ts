/** A cubemap has six faces; the scheduler walks them in this order. */
export const CUBE_FACE_COUNT = 6;

// "Has the cube gone stale?" thresholds, measured against the state the current
// cubemap was captured at rather than against the previous frame. That
// distinction matters: a per-frame comparison measures velocity, so anything
// drifting slower than the threshold would never trigger a refresh at all. A
// glider descending at 3 m/s moves 0.05m per frame — under any workable
// per-frame epsilon — and would otherwise lose hundreds of metres of altitude
// against a cubemap captured at the top.
//
// SkyRenderer recomputes the sun direction deterministically each frame, so a
// parked sky gives a delta of exactly zero and the cycle idles. These only have
// to be small enough to let a real change through, not to filter noise.
const SUN_EPSILON = 1e-4; // per component of the normalised sun direction
const WEATHER_EPSILON = 1e-4; // cloudiness / foginess / temperature, all 0..1
const ALTITUDE_EPSILON = 0.5; // metres of camera height

// "Has it jumped?" thresholds, and these *are* per-frame — a jump is by
// definition something that happened between two frames. A change this large in
// one frame is not the world evolving, it is a slider drag, a console setter or
// a camera teleport, and the six faces would otherwise straddle two visibly
// different skies rather than two adjacent instants.
//
// SUN_JUMP is ~3° of sun travel in one frame, roughly 100x the day/night rate.
//
// ALTITUDE_JUMP is set from the fog layer, which is what altitude actually
// drives in the captured shader: density falls as exp(-dh / scaleHeight) with
// scaleHeight = mix(15, 50, foginess) (fog.wgsl), so ~20m is about one scale
// height at the thin end — the point where the fog term visibly differs. It is
// also far above any continuous motion (20m in a frame is 1200 m/s at 60fps),
// so ordinary flight and falling stay on the amortised path. Erring low is
// deliberate: a needless full refresh costs six passes over 98k texels, while a
// missed one shows up as faces that disagree.
const SUN_JUMP = 0.05;
const WEATHER_JUMP = 0.05;
const ALTITUDE_JUMP = 20.0;

/**
 * Decides how many cube faces to redraw on a given frame.
 *
 * The sky evolves over seconds, so re-rendering all six faces every frame would
 * be pure waste. Instead a *cycle* — one full pass over the six faces — is
 * spread one face per frame, giving a complete refresh every 100ms at 60fps.
 * Any change to the sky restarts the cycle, so a moving sun keeps the cycle
 * permanently running and a parked one costs nothing at all.
 *
 * The faces of a cycle are therefore captured up to six frames apart, and under
 * a moving sun they disagree very slightly at their seams. That is invisible in
 * the only thing this cubemap is for: it is convolved into diffuse irradiance
 * and roughness-blurred specular before anything samples it.
 *
 * A discontinuity — a jumped sun or a stepped weather value — is the case where
 * that reasoning fails, because the six faces would then straddle two different
 * skies rather than two adjacent instants. Those redraw all six at once.
 *
 * The two questions are asked against different baselines, which is the one
 * non-obvious thing here. "Did it jump?" compares against the previous frame,
 * because that is what a jump is. "Has it gone stale?" compares against the
 * state the current cubemap was captured at, because comparing that against the
 * previous frame would measure velocity — and anything drifting slower than the
 * threshold per frame would then never trigger a refresh however far it
 * eventually travelled.
 */
export class SkyCaptureScheduler {
  /** Faces redrawn per frame while a cycle is running. */
  facesPerFrame: number = 1;

  private pending: number = CUBE_FACE_COUNT;
  private immediate: boolean = true;
  private cursor: number = 0;

  // Two baselines, deliberately. `frame*` is last frame and answers "did it
  // jump?"; `base*` is the state the running cycle was started at and answers
  // "has the cube gone stale?". Collapsing them into one loses slow drift.
  private hasFrame: boolean = false;
  private frameSunX: number = 0;
  private frameSunY: number = 0;
  private frameSunZ: number = 0;
  private frameCloudiness: number = 0;
  private frameFoginess: number = 0;
  private frameTemperature: number = 0;
  private frameAltitude: number = 0;

  private hasBase: boolean = false;
  private baseSunX: number = 0;
  private baseSunY: number = 0;
  private baseSunZ: number = 0;
  private baseCloudiness: number = 0;
  private baseFoginess: number = 0;
  private baseTemperature: number = 0;
  private baseAltitude: number = 0;

  /** Faces still owed by the current cycle. Zero means the cubemap is current. */
  get facesPending(): number {
    return this.pending;
  }

  /** Next face the cycle will draw. Exposed for debug readouts. */
  get nextFaceIndex(): number {
    return this.cursor;
  }

  /**
   * Records this frame's sky state and returns how many faces to redraw now.
   * The caller must draw exactly that many, taking each index from
   * {@link nextFace} — the count is deducted from the cycle on the way out.
   *
   * Every argument is a primitive rather than a params object: this runs once
   * per frame, and a per-frame object literal is exactly what the allocation
   * rules forbid.
   */
  plan(
    sunX: number,
    sunY: number,
    sunZ: number,
    cloudiness: number,
    foginess: number,
    temperature: number,
    altitude: number
  ): number {
    // Jump test, against last frame. Only ever escalates an already-running
    // cycle to finish this frame; it never starts one on its own, because a
    // jump necessarily also fails the staleness test below.
    if (this.hasFrame) {
      const frameSun = Math.max(
        Math.abs(sunX - this.frameSunX),
        Math.abs(sunY - this.frameSunY),
        Math.abs(sunZ - this.frameSunZ)
      );
      const frameWeather = Math.max(
        Math.abs(cloudiness - this.frameCloudiness),
        Math.abs(foginess - this.frameFoginess),
        Math.abs(temperature - this.frameTemperature)
      );
      if (
        frameSun > SUN_JUMP ||
        frameWeather > WEATHER_JUMP ||
        Math.abs(altitude - this.frameAltitude) > ALTITUDE_JUMP
      ) {
        this.immediate = true;
      }
    }

    this.frameSunX = sunX;
    this.frameSunY = sunY;
    this.frameSunZ = sunZ;
    this.frameCloudiness = cloudiness;
    this.frameFoginess = foginess;
    this.frameTemperature = temperature;
    this.frameAltitude = altitude;
    this.hasFrame = true;

    // Staleness test, against the state the running cycle was started at. This
    // is what makes drift slower than a threshold-per-frame still accumulate
    // into a refresh rather than being rounded away every frame.
    const stale =
      !this.hasBase ||
      Math.abs(sunX - this.baseSunX) > SUN_EPSILON ||
      Math.abs(sunY - this.baseSunY) > SUN_EPSILON ||
      Math.abs(sunZ - this.baseSunZ) > SUN_EPSILON ||
      Math.abs(cloudiness - this.baseCloudiness) > WEATHER_EPSILON ||
      Math.abs(foginess - this.baseFoginess) > WEATHER_EPSILON ||
      Math.abs(temperature - this.baseTemperature) > WEATHER_EPSILON ||
      Math.abs(altitude - this.baseAltitude) > ALTITUDE_EPSILON;

    if (stale) {
      this.pending = CUBE_FACE_COUNT;
      this.baseSunX = sunX;
      this.baseSunY = sunY;
      this.baseSunZ = sunZ;
      this.baseCloudiness = cloudiness;
      this.baseFoginess = foginess;
      this.baseTemperature = temperature;
      this.baseAltitude = altitude;
      this.hasBase = true;
    }

    if (this.pending === 0) return 0;

    const count = this.immediate
      ? this.pending
      : Math.min(this.facesPerFrame, this.pending);
    this.immediate = false;
    this.pending -= count;
    return count;
  }

  /** Index of the next face to draw, advancing the round-robin cursor. */
  nextFace(): number {
    const face = this.cursor;
    this.cursor = (face + 1) % CUBE_FACE_COUNT;
    return face;
  }

  /**
   * Restarts the cycle. `immediate` collapses it into the next frame rather
   * than spreading it — used for discontinuities, and for the very first
   * capture so that nothing is ever lit by a half-black cubemap.
   */
  refresh(immediate: boolean = false): void {
    this.pending = CUBE_FACE_COUNT;
    if (immediate) this.immediate = true;
  }
}
