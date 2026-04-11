/**
 * GPU timestamp query profiling system for measuring per-pass render times.
 *
 * Uses WebGPU's `timestamp-query` feature to record nanosecond-precision
 * GPU timestamps at the beginning and end of render passes, then resolves
 * them into readable millisecond values.
 *
 * Falls back to a no-op when the device doesn't support `timestamp-query`.
 * Has no performance impact when `enabled` is set to `false`.
 */
export class PerformanceMonitor {
  private device: GPUDevice | null = null;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readBuffer: GPUBuffer | null = null;
  private slotMap = new Map<string, { beginIndex: number; endIndex: number }>();
  private queryCount = 0;
  private supported = false;
  private pendingRead = false;
  private lastLogTime = 0;
  private latestResults = new Map<string, number>();

  /** Set to `false` to disable all profiling (zero overhead). */
  enabled = false;

  /** How often (in ms) to resolve and log GPU timings. Default: 1000ms. */
  logIntervalMs = 1000;

  /**
   * Initialize the monitor with a device and a list of named pass labels.
   * Each label corresponds to one timed render region (begin + end timestamp).
   */
  init(device: GPUDevice, labels: string[]): void {
    this.device = device;
    this.supported = device.features.has('timestamp-query');

    if (!this.supported) {
      console.warn(
        'PerformanceMonitor: timestamp-query feature not available — GPU profiling disabled'
      );
      return;
    }

    this.queryCount = labels.length * 2; // 2 timestamps per label (begin + end)

    labels.forEach((label, i) => {
      this.slotMap.set(label, {
        beginIndex: i * 2,
        endIndex: i * 2 + 1,
      });
    });

    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: this.queryCount,
    });

    this.resolveBuffer = device.createBuffer({
      label: 'perf-monitor resolve',
      size: this.queryCount * 8, // 8 bytes per uint64 timestamp
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });

    this.readBuffer = device.createBuffer({
      label: 'perf-monitor readback',
      size: this.queryCount * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Returns a `timestampWrites` descriptor for a render pass.
   * Pass the returned value into `encoder.beginRenderPass({ ..., timestampWrites })`.
   *
   * Returns `undefined` when profiling is disabled or the feature isn't supported,
   * which safely causes `beginRenderPass` to ignore timestamp writes.
   */
  getTimestampWrites(label: string): GPURenderPassTimestampWrites | undefined {
    if (!this.enabled || !this.querySet) return undefined;
    const slot = this.slotMap.get(label);
    if (!slot) return undefined;

    // The installed @webgpu/types (0.1.21) define the older iterable-based format,
    // but modern browsers use the object format. Cast through unknown to bridge.
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: slot.beginIndex,
      endOfPassWriteIndex: slot.endIndex,
    } as unknown as GPURenderPassTimestampWrites;
  }

  /**
   * Call once per frame after all profiled passes have been submitted.
   * Periodically resolves timestamps and logs results to the console.
   */
  resolveAndLog(): void {
    if (!this.enabled || !this.supported || !this.device || this.pendingRead)
      return;

    const now = performance.now();
    if (now - this.lastLogTime < this.logIntervalMs) return;

    this.lastLogTime = now;
    this.pendingRead = true;

    const encoder = this.device.createCommandEncoder({
      label: 'perf-monitor resolve',
    });
    encoder.resolveQuerySet(
      this.querySet!,
      0,
      this.queryCount,
      this.resolveBuffer!,
      0
    );
    encoder.copyBufferToBuffer(
      this.resolveBuffer!,
      0,
      this.readBuffer!,
      0,
      this.queryCount * 8
    );
    this.device.queue.submit([encoder.finish()]);

    this.readAndLog();
  }

  /** Returns the most recently read results (label → ms). */
  getLatestResults(): ReadonlyMap<string, number> {
    return this.latestResults;
  }

  private async readAndLog(): Promise<void> {
    try {
      await this.readBuffer!.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(
        this.readBuffer!.getMappedRange().slice(0)
      );
      this.readBuffer!.unmap();

      const table: Record<string, string> = {};
      let totalMs = 0;

      for (const [label, slot] of this.slotMap) {
        const beginNs = data[slot.beginIndex];
        const endNs = data[slot.endIndex];
        const ms = Number(endNs - beginNs) / 1_000_000;
        this.latestResults.set(label, ms);
        table[label] = ms.toFixed(3) + ' ms';
        totalMs += ms;
      }

      this.latestResults.set('sky-total', totalMs);
      table['sky-total (sum)'] = totalMs.toFixed(3) + ' ms';
      console.table(table);
    } catch {
      // Ignore read errors (buffer destroyed, device lost, etc.)
    }
    this.pendingRead = false;
  }

  dispose(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readBuffer?.destroy();
    this.querySet = null;
    this.resolveBuffer = null;
    this.readBuffer = null;
    this.device = null;
    this.supported = false;
  }
}
