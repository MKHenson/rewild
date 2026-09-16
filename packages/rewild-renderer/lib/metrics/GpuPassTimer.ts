import { MetricsRegistry } from './MetricsRegistry';

/**
 * Deferred `timestampWrites`, for a pass that only runs on some frames.
 *
 * Call it at the point the pass is genuinely begun. Evaluating it into an
 * argument list would count the frames the pass sat out. See
 * `GpuPassTimer.writes`.
 */
export type TimestampWritesFn = () => GPURenderPassTimestampWrites | undefined;

interface Slot {
  label: string;
  beginIndex: number;
  endIndex: number;
}

/** One pass's raw timestamps from a single readback. */
export interface PassReading {
  label: string;
  begin: bigint;
  end: bigint;
}

/**
 * Per-pass GPU cost in ms from one command buffer's timestamps.
 *
 * Pass only the passes that actually ran, in encode order.
 *
 * Where every pass reports a begin of its own, the durations are real and are
 * used as they are. Passes can legitimately overlap there, one draining while
 * the next starts, so the costs may sum past the buffer's wall time.
 *
 * Some backends instead resolve a pass-boundary write to the start of the whole
 * command buffer, so several passes claim the same begin and each `end - begin`
 * is a running total. Ends stay monotonic, so the cost of each pass is taken
 * from the gap to the previous end. Mixed sets, where the first pass keeps its
 * own begin and the rest collapse, take this path too.
 */
export function derivePassCosts(fresh: PassReading[]): Map<string, number> {
  const costs = new Map<string, number>();
  if (fresh.length === 0) return costs;

  const distinctBegins = new Set(fresh.map((r) => r.begin)).size;
  if (distinctBegins === fresh.length) {
    for (const reading of fresh) {
      costs.set(reading.label, toMs(reading.end - reading.begin));
    }
    return costs;
  }

  const ordered = [...fresh].sort((a, b) =>
    a.end < b.end ? -1 : a.end > b.end ? 1 : 0
  );
  let previousEnd = ordered.reduce(
    (lowest, r) => (r.begin < lowest ? r.begin : lowest),
    ordered[0].begin
  );
  for (const reading of ordered) {
    costs.set(reading.label, toMs(reading.end - previousEnd));
    previousEnd = reading.end;
  }
  return costs;
}

/**
 * GPU time per render pass, published into a MetricsRegistry.
 *
 *     const timer = new GpuPassTimer(renderer.metrics, 'gpu/sky');
 *     timer.init(device, ['clouds', 'atmosphere']); // encode order
 *     encoder.beginRenderPass({ ..., timestampWrites: timer.writes('clouds') });
 *     timer.resolve(); // once per frame, after the submits
 *
 * Falls back to a no-op when the device has no `timestamp-query`, and records
 * nothing while the registry is disabled.
 *
 * Labels must be given in the order the passes are encoded. See `publish` for
 * why that matters.
 */
/**
 * Readbacks kept in flight.
 *
 * One buffer means `resolve` has to sit out every frame until the previous
 * `mapAsync` lands, which on a 27ms frame is three or four frames. Duty is
 * samples per frame, so a publisher that reports every fourth frame makes a
 * pass that runs every sixth frame look like it runs every one and a half.
 * Three buffers is enough to publish on every frame at any frame rate this
 * engine reaches.
 */
const READBACK_RING = 3;

export class GpuPassTimer {
  private device: GPUDevice | null = null;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readBuffers: GPUBuffer[] = [];
  private busy: boolean[] = [];
  private slots: Slot[] = [];
  private byLabel = new Map<string, Slot>();
  private queryCount = 0;
  private supported = false;
  private latestBegins = new Map<string, bigint>();

  constructor(
    private readonly registry: MetricsRegistry,
    private readonly group: string
  ) {}

  /** True once a device with timestamp-query support has been bound. */
  get available(): boolean {
    return this.supported;
  }

  init(device: GPUDevice, labels: string[]): void {
    this.dispose();
    this.device = device;
    this.supported = device.features.has('timestamp-query');
    if (!this.supported) return;

    this.queryCount = labels.length * 2;
    this.slots = labels.map((label, i) => ({
      label,
      beginIndex: i * 2,
      endIndex: i * 2 + 1,
    }));
    this.byLabel.clear();
    for (const slot of this.slots) this.byLabel.set(slot.label, slot);

    for (let i = 0; i < this.slots.length; i++) {
      this.registry.declare(this.key(this.slots[i].label), {
        label: this.slots[i].label,
        group: this.group,
        order: i,
        activityTracked: true,
      });
    }

    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: this.queryCount,
    });
    this.resolveBuffer = device.createBuffer({
      label: `${this.group} resolve`,
      size: this.queryCount * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    for (let i = 0; i < READBACK_RING; i++) {
      this.readBuffers.push(
        device.createBuffer({
          label: `${this.group} readback ${i}`,
          size: this.queryCount * 8,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })
      );
      this.busy.push(false);
    }
  }

  /**
   * `timestampWrites` for a pass, or undefined when profiling is off, which
   * `beginRenderPass` ignores.
   *
   * **Calling this counts as encoding the pass.** It is what duty is measured
   * from, so it must be called once per frame the pass actually runs and never
   * on a frame it is skipped. A pass that only runs sometimes therefore has to
   * take a `TimestampWritesFn` and call it inside its own guard, rather than
   * having the descriptor evaluated into its arguments.
   *
   * Duty cannot come from the timings themselves. A readback lands a few frames
   * late and only on about two frames in three, so counting arrivals measures
   * the readback rate and would report a pass that runs every frame as running
   * on two in three.
   */
  writes(label: string): GPURenderPassTimestampWrites | undefined {
    if (!this.registry.enabled || !this.querySet) return undefined;
    const slot = this.byLabel.get(label);
    if (!slot) return undefined;

    this.registry.markActive(this.key(label));

    // The installed @webgpu/types (0.1.21) describe the older iterable form of
    // this descriptor. Browsers take the object form.
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: slot.beginIndex,
      endOfPassWriteIndex: slot.endIndex,
    } as unknown as GPURenderPassTimestampWrites;
  }

  /** Call once per frame, after the passes this timer covers are submitted. */
  resolve(): void {
    if (!this.registry.enabled || !this.supported || !this.device) return;

    const index = this.busy.indexOf(false);
    if (index === -1) return; // Every buffer still in flight. Skip this frame.
    this.busy[index] = true;

    const encoder = this.device.createCommandEncoder({
      label: `${this.group} resolve`,
    });
    encoder.resolveQuerySet(
      this.querySet!,
      0,
      this.queryCount,
      this.resolveBuffer!,
      0
    );
    // Safe to share one resolve buffer across readbacks in flight: GPU commands
    // run in submission order, so each copy completes before the next resolve
    // overwrites it.
    encoder.copyBufferToBuffer(
      this.resolveBuffer!,
      0,
      this.readBuffers[index],
      0,
      this.queryCount * 8
    );
    this.device.queue.submit([encoder.finish()]);
    void this.read(index);
  }

  dispose(): void {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    for (const buffer of this.readBuffers) buffer.destroy();
    this.querySet = null;
    this.resolveBuffer = null;
    this.readBuffers = [];
    this.busy = [];
    this.device = null;
    this.supported = false;
    this.latestBegins.clear();
  }

  private key(label: string): string {
    return `${this.group}.${label}`;
  }

  private async read(index: number): Promise<void> {
    const buffer = this.readBuffers[index];
    try {
      await buffer.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(buffer.getMappedRange().slice(0));
      buffer.unmap();
      this.publish(data);
    } catch {
      // Buffer destroyed or device lost. Nothing to publish.
    }
    // Guarded because dispose() may have emptied the ring while this was in
    // flight, in which case the slot no longer exists.
    if (index < this.busy.length) this.busy[index] = false;
  }

  /**
   * Turn one readback into per-pass costs and publish them.
   *
   * A pass that was not encoded this frame keeps the timestamps from the last
   * frame it was, so its begin does not move and it is left out. Nothing is
   * published for it, and the registry counts that absence against the frames
   * in the window, which is what amortises a periodic pass correctly.
   *
   * The comparison is strictly greater rather than not-equal so a readback that
   * lands out of order is discarded instead of being read as a fresh run.
   *
   * The costs themselves come from derivePassCosts.
   */
  private publish(data: BigUint64Array): void {
    const fresh: PassReading[] = [];

    for (const slot of this.slots) {
      const begin = data[slot.beginIndex];
      const end = data[slot.endIndex];
      if (begin === 0n && end === 0n) continue;

      const latest = this.latestBegins.get(slot.label);
      if (latest !== undefined && begin <= latest) continue;

      this.latestBegins.set(slot.label, begin);
      fresh.push({ label: slot.label, begin, end });
    }

    for (const [label, ms] of derivePassCosts(fresh)) {
      this.registry.record(this.key(label), ms);
    }
  }
}

/** Nanosecond delta to milliseconds, floored at zero. */
function toMs(delta: bigint): number {
  const ms = Number(delta) / 1_000_000;
  return ms > 0 ? ms : 0;
}
