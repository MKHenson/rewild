import shader from './shaders/ui.wgsl';
import { PRIMITIVE_FLOATS } from './stream';
import { UISurface, UISurfaceOptions } from './UISurface';

export interface UIViewport {
  /** The target size in device pixels. */
  width: number;
  height: number;
  pixelRatio: number;
}

interface SurfaceBuffers {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

/** Draws surfaces in order, each in one draw call. */
export class UIRenderer {
  /** Draw calls in the last render. */
  drawCalls = 0;
  private surfaces: UISurface[] = [];
  private buffers = new Map<UISurface, SurfaceBuffers>();
  private pipeline: GPURenderPipeline;
  private uniforms: GPUBuffer;

  constructor(private device: GPUDevice, format: GPUTextureFormat) {
    const module = device.createShaderModule({ label: 'ui', code: shader });
    const blend: GPUBlendComponent = {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
    };
    this.pipeline = device.createRenderPipeline({
      label: 'ui',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format, blend: { color: blend, alpha: blend } }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.uniforms = device.createBuffer({
      label: 'ui-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  createSurface(options: UISurfaceOptions): UISurface {
    const surface = new UISurface(options);
    this.surfaces.push(surface);
    this.surfaces.sort((a, b) => a.order - b.order);
    return surface;
  }

  removeSurface(surface: UISurface): void {
    const index = this.surfaces.indexOf(surface);
    if (index !== -1) this.surfaces.splice(index, 1);
    this.buffers.get(surface)?.buffer.destroy();
    this.buffers.delete(surface);
  }

  /**
   * Draws every surface into `view`. Clears it first when `clearValue` is
   * given, or else draws over what is there.
   */
  render(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    viewport: UIViewport,
    clearValue?: GPUColor
  ): void {
    const { pixelRatio } = viewport;
    const width = viewport.width / pixelRatio;
    const height = viewport.height / pixelRatio;
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([width, height, pixelRatio, 0])
    );

    for (const surface of this.surfaces)
      if (surface.update(width, height)) this.upload(surface);

    const pass = encoder.beginRenderPass({
      label: 'ui',
      colorAttachments: [
        {
          view,
          clearValue,
          loadOp: clearValue ? 'clear' : 'load',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    this.drawCalls = 0;
    for (const surface of this.surfaces) {
      const count = surface.stream.count;
      const buffers = this.buffers.get(surface);
      if (!count || !buffers) continue;
      pass.setBindGroup(0, buffers.bindGroup);
      pass.draw(4, count);
      this.drawCalls++;
    }
    pass.end();
  }

  dispose(): void {
    for (const { buffer } of this.buffers.values()) buffer.destroy();
    this.buffers.clear();
    this.uniforms.destroy();
  }

  private upload(surface: UISurface): void {
    const { data, count } = surface.stream;
    if (!count) return;
    let buffers = this.buffers.get(surface);
    if (!buffers || buffers.buffer.size < data.byteLength) {
      buffers?.buffer.destroy();
      const buffer = this.device.createBuffer({
        label: `ui-${surface.name}`,
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: { buffer } },
        ],
      });
      buffers = { buffer, bindGroup };
      this.buffers.set(surface, buffers);
    }
    this.device.queue.writeBuffer(
      buffers.buffer,
      0,
      data,
      0,
      count * PRIMITIVE_FLOATS
    );
  }
}
