import { CUBE_FACE_COUNT } from './SkyCaptureScheduler';
import { SKY_CUBE_MIP_COUNT } from './SkyCubeCapture';
import {
  IBL_IRRADIANCE_STEP,
  IBL_SPECULAR_STEPS,
  IBL_STEP_COUNT,
  IBL_STEP_DOWNSAMPLE,
  IBL_STEP_SPECULAR_BASE,
  SkyIblSchedule,
} from './SkyIblSchedule';

/** Runs one frame in which the capture drew nothing. */
const idle = (s: SkyIblSchedule) => s.plan(0, CUBE_FACE_COUNT);
/** Runs one frame in which the capture advanced its own amortised cycle. */
const drifting = (s: SkyIblSchedule) => s.plan(1, CUBE_FACE_COUNT);
/** Runs one frame in which the capture redrew the whole cube. */
const jumped = (s: SkyIblSchedule) => s.plan(CUBE_FACE_COUNT, CUBE_FACE_COUNT);

/** Drains a schedule, returning the step indices it hands out. */
function runToCompletion(s: SkyIblSchedule, frame: () => number): number[] {
  const steps: number[] = [];
  for (let i = 0; i < IBL_STEP_COUNT * 4 && s.isRunning; i++) {
    const count = frame();
    for (let n = 0; n < count; n++) steps.push(s.takeStep());
  }
  return steps;
}

describe('IBL step layout', () => {
  it('covers every specular level except the mirror', () => {
    // Mip 0 is roughness 0, which is a copy of the capture rather than an
    // integral — the estimator degenerates there.
    expect(IBL_SPECULAR_STEPS).toBe(SKY_CUBE_MIP_COUNT - 1);
  });

  it('orders downsample first and irradiance last', () => {
    // Every later step reads the mip chain the first one builds.
    expect(IBL_STEP_DOWNSAMPLE).toBe(0);
    expect(IBL_STEP_SPECULAR_BASE).toBe(1);
    expect(IBL_IRRADIANCE_STEP).toBe(IBL_STEP_COUNT - 1);
  });
});

describe('SkyIblSchedule', () => {
  it('runs a full pass immediately on the first frame', () => {
    const schedule = new SkyIblSchedule();
    expect(idle(schedule)).toBe(IBL_STEP_COUNT);
  });

  it('visits every step exactly once per pass, in order', () => {
    const schedule = new SkyIblSchedule();
    const steps = runToCompletion(schedule, () => idle(schedule));
    expect(steps).toEqual(Array.from({ length: IBL_STEP_COUNT }, (_, i) => i));
  });

  it('goes quiet once the pass is done and the sky is still', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));
    for (let frame = 0; frame < 10; frame++) expect(idle(schedule)).toBe(0);
  });

  /**
   * The reason a pass is not restarted the moment the capture touches a face:
   * under a drifting sun the capture redraws one every frame, so a restart-on-
   * change policy would reset the pass on every frame and it would never reach
   * the irradiance step at the end.
   */
  it('finishes a pass rather than restarting while the capture drifts', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule)); // initial pass

    const steps: number[] = [];
    for (let frame = 0; frame < IBL_STEP_COUNT; frame++) {
      const count = drifting(schedule);
      for (let n = 0; n < count; n++) steps.push(schedule.takeStep());
    }

    expect(steps).toEqual(Array.from({ length: IBL_STEP_COUNT }, (_, i) => i));
  });

  it('starts the next pass once the last one finished against a moved sky', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));

    // One frame of capture movement, then stillness. The pass it triggers must
    // still run to completion.
    let drawn = drifting(schedule);
    for (let n = 0; n < drawn; n++) schedule.takeStep();

    for (let frame = 0; frame < IBL_STEP_COUNT * 2; frame++) {
      const count = idle(schedule);
      for (let n = 0; n < count; n++) schedule.takeStep();
      drawn += count;
    }
    expect(drawn).toBe(IBL_STEP_COUNT);
  });

  it('does not start a new pass when the source never moved', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));
    expect(schedule.isRunning).toBe(false);
    expect(idle(schedule)).toBe(0);
  });

  // A full capture refresh means the sky changed rather than evolved, so the
  // pass in flight is filtering a sky that no longer exists.
  it('abandons a part-done pass and catches up in one frame on a jump', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));

    drifting(schedule);
    schedule.takeStep(); // pass now part-way through

    expect(jumped(schedule)).toBe(IBL_STEP_COUNT);
    expect(schedule.takeStep()).toBe(IBL_STEP_DOWNSAMPLE);
  });

  it('honours stepsPerFrame', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));

    schedule.stepsPerFrame = 3;
    schedule.refresh();
    expect(idle(schedule)).toBe(3);
    expect(idle(schedule)).toBe(3);
    // Never overruns the pass, however many were asked for.
    expect(idle(schedule)).toBe(IBL_STEP_COUNT - 6);
  });

  it('spreads a forced refresh unless it is marked immediate', () => {
    const schedule = new SkyIblSchedule();
    runToCompletion(schedule, () => idle(schedule));

    schedule.refresh();
    expect(idle(schedule)).toBe(1);

    schedule.refresh(true);
    expect(idle(schedule)).toBe(IBL_STEP_COUNT);
  });
});
