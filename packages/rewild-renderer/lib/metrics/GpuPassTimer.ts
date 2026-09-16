import { MetricsRegistry } from './MetricsRegistry';

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
export class GpuPassTimer {
  private device: GPUDevice | null = null;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readBuffer: GPUBuffer | null = null;
  private slots: Slot[] = [];
  private byLabel = new Map<string, Slot>();
  private queryCount = 0;
  private supported = false;
  private pendingRead = false;
  private previousBegins = new Map<string, bigint>();

  constructor(
    private readonly registry: MetricsRegistry,
    private readonly group: string
  ) {}

  /** True once a device with timestamp-query support has been bound. */
  get available(): boolean {
    return this.supported;
  }

  init(device: GPUDevice, labels: string[]): void {
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
    this.readBuffer = device.createBuffer({
      label: `${this.group} readback`,
      size: this.queryCount * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * `timestampWrites` for a pass, or undefined when profiling is off, which
   * `beginRenderPass` ignores.
   */
  writes(label: string): GPURenderPassTimestampWrites | undefined {
    if (!this.registry.enabled || !this.querySet) return undefined;
    const slot = this.byLabel.get(label);
    if (!slot) return undefined;

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
    if (
      !this.registry.enabled ||
      !this.supported ||
      !this.device ||
      this.pendingRead
    ) {
      return;
    }
    this.pendingRead = true;

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
    encoder.copyBufferToBuffer(
      this.resolveBuffer!,
      0,
      this.readBuffer!,
      0,
      this.queryCount * 8
    );
    this.device.queue.submit([encoder.finish()]);
    this.read();
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
    this.previousBegins.clear();
  }

  private key(label: string): string {
    return `${this.group}.${label}`;
  }

  private async read(): Promise<void> {
    try {
      await this.readBuffer!.mapAsync(GPUMapMode.READ);
      const data = new BigUint64Array(
        this.readBuffer!.getMappedRange().slice(0)
      );
      this.readBuffer!.unmap();
      this.publish(data);
    } catch {
      // Buffer destroyed or device lost. Nothing to publish.
    }
    this.pendingRead = false;
  }

  /**
   * Turn one readback into per-pass costs and publish them.
   *
   * Staleness is decided here: a pass that was not encoded this frame keeps the
   * timestamps from the last frame it was, so its begin does not move. Those
   * are reported as a skip, which is what lets the registry amortise a 1-in-N
   * pass instead of charging its full cost to every frame.
   *
   * The costs themselves come from derivePassCosts.
   */
  private publish(data: BigUint64Array): void {
    const fresh: PassReading[] = [];

    for (const slot of this.slots) {
      const begin = data[slot.beginIndex];
      const end = data[slot.endIndex];
      const key = this.key(slot.label);

      if (begin === 0n && end === 0n) {
        this.registry.skip(key);
        continue;
      }
      if (this.previousBegins.get(slot.label) === begin) {
        this.registry.skip(key);
        continue;
      }
      this.previousBegins.set(slot.label, begin);
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
