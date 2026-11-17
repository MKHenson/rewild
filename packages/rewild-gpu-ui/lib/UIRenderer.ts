import type { UIFont } from './font';
import meterEffect from './shaders/meter.wgsl';
import { PRIMITIVE_FLOATS } from './stream';
import { UIEffects } from './UIEffects';
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

/** A run of primitives in one surface that share a pipeline. */
interface DrawRun {
  bindGroup: GPUBindGroup;
  pipeline: GPURenderPipeline;
  first: number;
  count: number;
}

/**
 * Draws surfaces in order, each in one draw call per run of an effect. Boxes
 * and text share the plain rect pipeline.
 */
export class UIRenderer {
  /** Draw calls in the last render. */
  drawCalls = 0;
  readonly effects: UIEffects;
  private surfaces: UISurface[] = [];
  private buffers = new Map<UISurface, SurfaceBuffers>();
  private bindGroupLayout: GPUBindGroupLayout;
  private uniforms: GPUBuffer;
  private runs: DrawRun[] = [];
  private _font: UIFont | null = null;
  private sampler: GPUSampler;
  /** Bound in place of the atlas until there is a font. */
  private emptyAtlas: GPUTexture;

  constructor(private device: GPUDevice, format: GPUTextureFormat) {
    const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'ui',
      entries: [
        { binding: 0, visibility, buffer: { type: 'uniform' } },
        { binding: 1, visibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.sampler = device.createSampler({
      label: 'ui-font',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.emptyAtlas = device.createTexture({
      label: 'ui-empty-atlas',
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    const layout = device.createPipelineLayout({
      label: 'ui',
      bindGroupLayouts: [this.bindGroupLayout],
    });
    this.effects = new UIEffects(device, format, layout);
    this.effects.register('meter', meterEffect);
    this.uniforms = device.createBuffer({
      label: 'ui-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * The font every surface's text measures and draws with. The renderer does
   * not own it, so it does not dispose it.
   */
  get font(): UIFont | null {
    return this._font;
  }

  set font(font: UIFont | null) {
    if (font === this._font) return;
    this._font = font;
    for (const surface of this.surfaces) surface.font = font;
    for (const buffers of this.buffers.values())
      buffers.bindGroup = this.createBindGroup(buffers.buffer);
  }

  createSurface(options: UISurfaceOptions): UISurface {
    const surface = new UISurface(options);
    surface.font = this._font;
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
   * given, or else draws over what is there. With no `clearValue` and nothing
   * to draw, it starts no pass.
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
      new Float32Array([width, height, pixelRatio, performance.now() / 1000])
    );

    // Find the pipelines before the pass, so an unknown effect throws
    // with no pass left open.
    const runs = this.runs;
    runs.length = 0;
    for (const surface of this.surfaces) {
      surface.update(width, height, pixelRatio);
      this.upload(surface);
      const buffers = this.buffers.get(surface);
      const { count, effects } = surface.stream;
      if (!buffers) continue;
      for (let first = 0; first < count; ) {
        const effect = effects[first];
        let end = first + 1;
        while (end < count && effects[end] === effect) end++;
        runs.push({
          bindGroup: buffers.bindGroup,
          pipeline: this.effects.pipeline(effect),
          first,
          count: end - first,
        });
        first = end;
      }
    }

    this.drawCalls = 0;
    if (!runs.length && !clearValue) return;
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
    let bindGroup: GPUBindGroup | null = null;
    let pipeline: GPURenderPipeline | null = null;
    for (const run of runs) {
      if (run.pipeline !== pipeline) pass.setPipeline(run.pipeline);
      if (run.bindGroup !== bindGroup) pass.setBindGroup(0, run.bindGroup);
      pipeline = run.pipeline;
      bindGroup = run.bindGroup;
      pass.draw(4, run.count, 0, run.first);
      this.drawCalls++;
    }
    pass.end();
  }

  dispose(): void {
    for (const { buffer } of this.buffers.values()) buffer.destroy();
    this.buffers.clear();
    this.uniforms.destroy();
    this.emptyAtlas.destroy();
  }

  private createBindGroup(buffer: GPUBuffer): GPUBindGroup {
    const atlas = this._font?.texture ?? this.emptyAtlas;
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: atlas.createView() },
        { binding: 3, resource: this.sampler },
      ],
    });
  }

  /** Uploads the primitives that changed since the last upload. */
  private upload(surface: UISurface): void {
    const stream = surface.stream;
    const { data, count } = stream;
    let { dirtyFrom: from, dirtyTo: to } = stream;
    stream.clearDirty();
    if (!count || from >= to) return;
    let buffers = this.buffers.get(surface);
    if (!buffers || buffers.buffer.size < count * PRIMITIVE_FLOATS * 4) {
      buffers?.buffer.destroy();
      const buffer = this.device.createBuffer({
        label: `ui-${surface.name}`,
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      buffers = { buffer, bindGroup: this.createBindGroup(buffer) };
      this.buffers.set(surface, buffers);
      // A new buffer holds nothing yet.
      from = 0;
      to = count;
    }
    this.device.queue.writeBuffer(
      buffers.buffer,
      from * PRIMITIVE_FLOATS * 4,
      data,
      from * PRIMITIVE_FLOATS,
      (to - from) * PRIMITIVE_FLOATS
    );
  }
}
