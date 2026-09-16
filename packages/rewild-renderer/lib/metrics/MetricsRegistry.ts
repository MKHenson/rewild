import { TimedWindow } from './TimedWindow';

export type MetricKind = 'duration' | 'count';

export interface MetricOptions {
  /** Row label in the panel. */
  label: string;
  /** Section the row sits under, e.g. 'gpu/sky' or 'cpu'. */
  group: string;
  /** 'duration' is milliseconds and amortises by duty. 'count' does not. */
  kind?: MetricKind;
  /** Order within the group. Lower sorts first. Defaults to registration order. */
  order?: number;
  /**
   * Duty comes from `markActive` rather than from how often a value arrives.
   *
   * Set this when the cost is sampled on a different cadence than the work
   * happens. GPU passes are the case that matters: a readback lands a few
   * frames late and not on every frame, so counting values would measure the
   * readback rate. Encode time knows the truth and reports it every frame.
   */
  activityTracked?: boolean;
}

/** One metric as the panel reads it. */
export interface MetricView {
  key: string;
  label: string;
  group: string;
  kind: MetricKind;
  /** Mean of the samples taken. For a periodic pass this is its cost on the
   *  frames it runs, not its cost per frame. */
  perRun: number;
  /** Highest single sample in the window. The spike a mean hides. */
  max: number;
  /** How often the work happened, per frame, over the window. A pass rebuilding
   *  one frame in six reads 0.167. Anything running every frame reads 1. */
  duty: number;
  /** perRun scaled by duty: what this costs the average frame. */
  perFrame: number;
  order: number;
}

class Metric {
  /** Costs. For a GPU pass these arrive late and not every frame. */
  readonly samples: TimedWindow;
  /** One mark per frame the work actually happened. Only used when
   *  `activityTracked`, where it is the sole source of duty. */
  readonly active: TimedWindow;

  constructor(
    readonly key: string,
    readonly label: string,
    readonly group: string,
    readonly kind: MetricKind,
    readonly order: number,
    readonly activityTracked: boolean,
    windowMs: number
  ) {
    this.samples = new TimedWindow(windowMs);
    this.active = new TimedWindow(windowMs);
  }
}

/** Frames ignored after a reset, while pipelines rebuild and caches warm. */
const WARMUP_FRAMES = 30;

/**
 * One place every performance number is published to, and the only place the
 * panel reads from.
 *
 *     renderer.metrics.enabled = true;
 *     renderer.metrics.declare('cpu.cull', { label: 'cull', group: 'cpu' });
 *     renderer.metrics.begin('cpu.cull');
 *     // ...work...
 *     renderer.metrics.end('cpu.cull');
 *     renderer.metrics.snapshot(); // MetricView[]
 *
 * Every method returns immediately while `enabled` is false, so a closed panel
 * costs nothing but the branch.
 *
 * Duty is derived rather than declared: a metric's samples are counted against
 * the frames in the same window, so a pass that publishes on one frame in six
 * reads 0.167 without anyone having to say so. That only holds while publishers
 * report every frame they run, which is why GpuPassTimer reads back on a ring
 * of buffers rather than skipping frames.
 */
export class MetricsRegistry {
  /** Nothing is recorded while this is false. The panel sets it on open. */
  enabled = false;

  /** How far back every window reaches. */
  windowMs = 2000;

  private metrics = new Map<string, Metric>();
  private openSpans = new Map<string, number>();
  private frames = new TimedWindow(this.windowMs);
  private registrationCount = 0;
  private warmupRemaining = WARMUP_FRAMES;

  /**
   * True while the first frames after a reset are being discarded.
   *
   * A quality change recompiles pipelines, and the frame after one can cost a
   * hundred milliseconds on the GPU. Left in, that single sample dominates the
   * mean for the whole window and makes a pass look several times its real
   * cost.
   */
  get settling(): boolean {
    return this.warmupRemaining > 0;
  }

  /**
   * Frames in the current window. Small numbers mean a thin sample: at one
   * frame per second a two second window holds two of them, and every mean in
   * the panel is really a reading of those two frames.
   */
  get frameCount(): number {
    this.frames.prune(performance.now());
    return this.frames.count;
  }

  /** Call once per frame, before anything is recorded. */
  beginFrame(): void {
    if (!this.enabled) return;
    if (this.warmupRemaining > 0) {
      this.warmupRemaining--;
      return;
    }
    this.frames.push(1, performance.now());
  }

  declare(key: string, options: MetricOptions): void {
    if (this.metrics.has(key)) return;
    this.metrics.set(
      key,
      new Metric(
        key,
        options.label,
        options.group,
        options.kind ?? 'duration',
        options.order ?? this.registrationCount++,
        options.activityTracked ?? false,
        this.windowMs
      )
    );
  }

  /** Publish one sample. Declares the metric first if it is new. */
  record(key: string, value: number, options?: MetricOptions): void {
    if (!this.enabled) return;
    // Declared before the warm-up guard, not after. A metric that only carries
    // its options on the first record would otherwise never be declared at all
    // when that first call lands during warm-up.
    if (options) this.declare(key, options);
    if (this.warmupRemaining > 0) return;
    this.metrics.get(key)?.samples.push(value, performance.now());
  }

  /**
   * Note that the work behind a metric happened this frame.
   *
   * Only for `activityTracked` metrics, and it must be called on every frame
   * the work happens, whether or not a cost lands for it. This is what keeps a
   * pass that runs every frame at duty 1 even though its timings arrive on two
   * frames in three.
   */
  markActive(key: string): void {
    if (!this.enabled || this.warmupRemaining > 0) return;
    this.metrics.get(key)?.active.push(1, performance.now());
  }

  /** Open a CPU span. Pairs with `end`. */
  begin(key: string): void {
    if (!this.enabled) return;
    this.openSpans.set(key, performance.now());
  }

  /** Close a CPU span opened by `begin` and record its duration. */
  end(key: string, options?: MetricOptions): void {
    if (!this.enabled) return;
    const started = this.openSpans.get(key);
    if (started === undefined) return;
    this.openSpans.delete(key);
    this.record(key, performance.now() - started, options);
  }

  /** Everything the panel needs, sorted by group then declared order. */
  snapshot(): MetricView[] {
    const now = performance.now();
    this.frames.prune(now);
    const frameCount = this.frames.count;

    const views: MetricView[] = [];
    for (const metric of this.metrics.values()) {
      metric.samples.prune(now);
      metric.active.prune(now);
      if (metric.samples.count === 0) continue;

      const perRun = metric.samples.avg;
      // Activity where it is tracked, value arrivals otherwise. Capped at 1: a
      // metric reporting more than once a frame is not running more often than
      // the frame does, and a duty above 1 would inflate its share of it.
      const occurrences = metric.activityTracked
        ? metric.active.count
        : metric.samples.count;
      const duty = frameCount > 0 ? Math.min(occurrences / frameCount, 1) : 0;

      views.push({
        key: metric.key,
        label: metric.label,
        group: metric.group,
        kind: metric.kind,
        perRun,
        max: metric.samples.max,
        duty,
        perFrame: metric.kind === 'duration' ? perRun * duty : perRun,
        order: metric.order,
      });
    }
    views.sort((a, b) =>
      a.group === b.group ? a.order - b.order : a.group < b.group ? -1 : 1
    );
    return views;
  }

  /**
   * Drop every sample and re-arm the warm-up. Declarations are kept.
   *
   * Called whenever something invalidates the numbers rather than merely
   * changes them: a pipeline rebuild, a resize, the panel opening.
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.samples.reset();
      metric.active.reset();
    }
    this.frames.reset();
    this.openSpans.clear();
    this.warmupRemaining = WARMUP_FRAMES;
  }
}
