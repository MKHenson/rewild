/**
 * Rolling window of samples covering a fixed span of wall time.
 *
 *     const w = new TimedWindow(2000);
 *     w.push(16.7, performance.now());
 *     w.avg; // 16.7
 *
 * Time rather than a sample count, because the things publishing into these
 * windows do not all sample at the same rate. A fixed count of 120 is two
 * seconds of a per-frame metric and fourteen seconds of a slower one, which
 * leaves a spike sitting in one mean long after it has left the other.
 *
 * A window rather than a running mean, because these numbers spike and the mean
 * is exactly what hides it. `max` is the reason this class exists.
 */
export class TimedWindow {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  /** Index the next sample is written to. */
  private head = 0;
  private size = 0;

  /**
   * @param durationMs How far back the window reaches.
   * @param capacity Hard ceiling on samples held. At 240 a 2s window covers
   *   120fps; faster publishing than that drops the oldest sample early.
   */
  constructor(readonly durationMs: number = 2000, readonly capacity = 256) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  push(value: number, now: number): void {
    this.times[this.head] = now;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
    this.prune(now);
  }

  /** Drop samples that have aged out. Safe to call on a window nothing pushed. */
  prune(now: number): void {
    const cutoff = now - this.durationMs;
    while (this.size > 0 && this.times[this.oldest] < cutoff) this.size--;
  }

  get count(): number {
    return this.size;
  }

  get last(): number {
    if (this.size === 0) return 0;
    return this.values[(this.head + this.capacity - 1) % this.capacity];
  }

  get avg(): number {
    if (this.size === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.size; i++) {
      total += this.values[(this.oldest + i) % this.capacity];
    }
    return total / this.size;
  }

  get max(): number {
    if (this.size === 0) return 0;
    let highest = -Infinity;
    for (let i = 0; i < this.size; i++) {
      const value = this.values[(this.oldest + i) % this.capacity];
      if (value > highest) highest = value;
    }
    return highest;
  }

  reset(): void {
    this.head = 0;
    this.size = 0;
  }

  private get oldest(): number {
    return (this.head - this.size + this.capacity) % this.capacity;
  }
}
