import { Stat } from './Stat';

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
}

/** One metric as the panel reads it. */
export interface MetricView {
  key: string;
  label: string;
  group: string;
  kind: MetricKind;
  /** Average of the samples actually taken. For a periodic pass this is its
   *  cost on the frames it runs, not its cost per frame. */
  perRun: number;
  /** Highest single sample in the window. The spike a mean hides. */
  max: number;
  /** Fraction of ticks that produced a sample. 1 means every frame. */
  duty: number;
  /** perRun scaled by duty: what this actually costs the average frame. */
  perFrame: number;
  order: number;
}

class Metric {
  readonly samples: Stat;
  /** 1 on a tick that produced a sample, 0 on a tick that skipped. Its mean is
   *  the duty cycle, which is how a 1-in-N pass gets amortised honestly. */
  readonly duty: Stat;

  constructor(
    readonly key: string,
    readonly label: string,
    readonly group: string,
    readonly kind: MetricKind,
    readonly order: number,
    capacity: number
  ) {
    this.samples = new Stat(capacity);
    this.duty = new Stat(capacity);
  }
}

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
 */
export class MetricsRegistry {
  /** Nothing is recorded while this is false. The panel sets it on open. */
  enabled = false;

  /** Samples held per metric. 120 is about two seconds at 60 fps. */
  windowSize = 120;

  private metrics = new Map<string, Metric>();
  private openSpans = new Map<string, number>();
  private registrationCount = 0;

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
        this.windowSize
      )
    );
  }

  /** Publish one sample. Declares the metric first if it is new. */
  record(key: string, value: number, options?: MetricOptions): void {
    if (!this.enabled) return;
    if (options) this.declare(key, options);
    const metric = this.metrics.get(key);
    if (!metric) return;
    metric.samples.push(value);
    metric.duty.push(1);
  }

  /**
   * Mark that a metric had nothing to report this tick.
   *
   * This is what separates "ran and cost nothing" from "did not run". Without
   * it a pass that rebuilds one frame in six looks six times more expensive
   * than it is.
   */
  skip(key: string): void {
    if (!this.enabled) return;
    this.metrics.get(key)?.duty.push(0);
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
    const views: MetricView[] = [];
    for (const metric of this.metrics.values()) {
      if (metric.samples.count === 0) continue;
      const perRun = metric.samples.avg;
      const duty = metric.duty.avg;
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

  /** Drop every sample but keep the declarations. */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.samples.reset();
      metric.duty.reset();
    }
    this.openSpans.clear();
  }
}
