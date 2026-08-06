import { SKY_CUBE_MIP_COUNT } from './SkyCubeCapture';

// The steps of one prefilter pass, in the order they must run.
//
// Step 0 fills the source cube's box-mip chain, which every later step reads,
// so it has to come first. The specular levels have no ordering requirement
// among themselves but are kept ascending, so a half-finished pass degrades
// from sharp to blurry rather than in patches.
//
// A step is one *level*, all six faces, rather than one face. The levels differ
// in cost by orders of magnitude — mip 1 is 4096 texels a face, mip 7 is one —
// so a per-face budget would spend most frames doing almost nothing and would
// stretch a full pass past a second. A level is the coarsest unit that still
// keeps the worst frame small: the largest, specular mip 1, is six faces of
// 4096 texels at 64 samples.

/** Box-filter the source cube's mips 1..n, and copy mip 0 into the specular cube. */
export const IBL_STEP_DOWNSAMPLE = 0;

/** First prefiltered roughness level; +1 per level from there. */
export const IBL_STEP_SPECULAR_BASE = 1;

/** Specular levels to prefilter: every mip except 0, which is a straight copy. */
export const IBL_SPECULAR_STEPS = SKY_CUBE_MIP_COUNT - 1;

/** The single irradiance step runs last — it is the cheapest and the blurriest. */
export const IBL_IRRADIANCE_STEP = IBL_STEP_SPECULAR_BASE + IBL_SPECULAR_STEPS;

/** Total steps in one full prefilter pass. */
export const IBL_STEP_COUNT = IBL_IRRADIANCE_STEP + 1;

/**
 * Paces the prefilter against the capture that feeds it.
 *
 * The capture and the prefilter both amortise, but they cannot amortise
 * independently: restarting the prefilter every time the capture touched a face
 * would mean a moving sun restarts it every frame and it never finishes. So a
 * pass always runs to completion, and only then asks whether the source moved
 * while it was running. Under a drifting sky that settles into a steady cycle;
 * under a still one it runs once and stops.
 *
 * A discontinuity is the exception, as it is for the capture. Six faces
 * redrawn in a frame means the source did not evolve, it changed — so the pass
 * in flight is describing a sky that no longer exists and is restarted whole.
 */
export class SkyIblSchedule {
  /** Steps run per frame while a pass is in flight. */
  stepsPerFrame: number = 1;

  // Starts mid-pass and immediate, as SkyCaptureScheduler does, and for the
  // same reason: nothing may ever be lit by a cube that has not been filled.
  private cursor: number = 0;
  private sourceVersion: number = 0;
  private passVersion: number = 0;
  private immediate: boolean = true;

  /** True while a pass has steps left to run. */
  get isRunning(): boolean {
    return this.cursor < IBL_STEP_COUNT;
  }

  /** Next step index a pass would run; equals IBL_STEP_COUNT when idle. */
  get nextStep(): number {
    return this.cursor;
  }

  /**
   * Records what the capture did this frame and returns how many steps to run.
   * Steps are consumed on the way out, so the caller must run exactly that
   * many, starting at {@link takeStep}.
   *
   * @param facesCaptured  faces the capture redrew this frame; a full six is
   *                       read as a discontinuity rather than as progress.
   * @param faceCount      the cubemap's face count, so the discontinuity test
   *                       is not a magic number here.
   */
  plan(facesCaptured: number, faceCount: number): number {
    if (facesCaptured > 0) this.sourceVersion++;

    if (facesCaptured >= faceCount) {
      // Restart outright rather than letting the in-flight pass finish: it is
      // filtering a sky that no longer exists.
      this.cursor = 0;
      this.passVersion = this.sourceVersion;
      this.immediate = true;
    } else if (!this.isRunning && this.passVersion !== this.sourceVersion) {
      this.cursor = 0;
      this.passVersion = this.sourceVersion;
    }

    if (!this.isRunning) return 0;

    const remaining = IBL_STEP_COUNT - this.cursor;
    const count = this.immediate
      ? remaining
      : Math.min(this.stepsPerFrame, remaining);
    this.immediate = false;
    return count;
  }

  /** Index of the next step to run, advancing the cursor. */
  takeStep(): number {
    return this.cursor++;
  }

  /**
   * Forces a full pass on the next frame. `immediate` collapses it into that
   * one frame — used at init, where nothing may sample an unfilled cube.
   */
  refresh(immediate: boolean = false): void {
    this.cursor = 0;
    this.passVersion = this.sourceVersion;
    if (immediate) this.immediate = true;
  }
}
