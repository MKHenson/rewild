import probeShader from '../../shaders/water-probe.wgsl';
import { OceanFFT } from './OceanFFT';
import { ShoreField } from './ShoreField';
import {
  PROBE_POINTS,
  PROBE_POINT_FLOATS,
  PROBE_RESULT_FLOATS,
  WaterQuery,
} from './WaterQuery';

// Readbacks in flight at once. A map lands a few frames after its submit, so
// one buffer would leave most frames without a dispatch.
const READBACKS = 3;
const RESULT_BYTES = PROBE_POINTS * PROBE_RESULT_FLOATS * 4;

/**
 * Where the drawn water surface stands over the points a WaterQuery's probes
 * ask for: one small compute pass a frame (water-probe.wgsl) displacing as the
 * water's vertices do, read back to the CPU a few frames late. `results` holds
 * the latest pass's output on the GPU.
 */
export class WaterProbe {
  readonly results: GPUBuffer;
  private points: GPUBuffer;
  private pointData = new Float32Array(PROBE_POINTS * PROBE_POINT_FLOATS);
  private resultData = new Float32Array(PROBE_POINTS * PROBE_RESULT_FLOATS);
  private reads: GPUBuffer[] = [];
  private readGenerations: Uint32Array[] = [];
  private busy: boolean[] = [];
  private pipeline: GPUComputePipeline;
  private group: GPUBindGroup;
  private disposed = false;

  constructor(
    device: GPUDevice,
    ocean: OceanFFT,
    waves: GPUBuffer,
    shoreField: ShoreField,
    sampler: GPUSampler
  ) {
    this.points = device.createBuffer({
      label: 'water probe points',
      size: this.pointData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.results = device.createBuffer({
      label: 'water probe results',
      size: RESULT_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    for (let i = 0; i < READBACKS; i++) {
      this.reads.push(
        device.createBuffer({
          label: 'water probe readback',
          size: RESULT_BYTES,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })
      );
      this.readGenerations.push(new Uint32Array(PROBE_POINTS));
      this.busy.push(false);
    }

    this.pipeline = device.createComputePipeline({
      label: 'water probe',
      layout: 'auto',
      compute: {
        module: device.createShaderModule({
          label: 'water probe',
          code: probeShader,
        }),
        entryPoint: 'probe',
      },
    });
    this.group = device.createBindGroup({
      label: 'water probe',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: waves } },
        { binding: 1, resource: { buffer: this.points } },
        { binding: 2, resource: { buffer: this.results } },
        {
          binding: 3,
          resource: ocean.displacement.createView({ dimension: '2d-array' }),
        },
        { binding: 4, resource: ocean.sampler },
        { binding: 5, resource: shoreField.texture.createView() },
        { binding: 6, resource: shoreField.swashTexture.createView() },
        { binding: 7, resource: sampler },
      ],
    });
  }

  /**
   * Probes the points `query` asked for since the last update, measured from
   * the waves' origin (`originX`, `originZ`), and hands the heights back to it
   * when the readback lands. Skips a frame when every readback is in flight.
   */
  update(
    device: GPUDevice,
    query: WaterQuery,
    originX: number,
    originZ: number
  ): void {
    const slot = this.busy.indexOf(false);
    if (slot < 0) return;
    const generations = this.readGenerations[slot];
    if (!query.stage(originX, originZ, this.pointData, generations)) return;

    device.queue.writeBuffer(this.points, 0, this.pointData);
    const encoder = device.createCommandEncoder({ label: 'water probe' });
    const pass = encoder.beginComputePass({ label: 'water probe' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil(PROBE_POINTS / 16));
    pass.end();
    encoder.copyBufferToBuffer(
      this.results,
      0,
      this.reads[slot],
      0,
      RESULT_BYTES
    );
    device.queue.submit([encoder.finish()]);
    this.busy[slot] = true;
    void this.read(slot, query);
  }

  dispose(): void {
    this.disposed = true;
    this.points.destroy();
    this.results.destroy();
    for (const read of this.reads) read.destroy();
  }

  private async read(slot: number, query: WaterQuery): Promise<void> {
    const buffer = this.reads[slot];
    try {
      await buffer.mapAsync(GPUMapMode.READ);
      this.resultData.set(new Float32Array(buffer.getMappedRange()));
      buffer.unmap();
      if (!this.disposed)
        query.receive(this.resultData, this.readGenerations[slot]);
    } catch {
      // Destroyed or the device was lost: nothing to hand back.
    }
    this.busy[slot] = false;
  }
}
