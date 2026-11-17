import type { UIFont } from './font';
import type { UIIcons } from './icons';
import meterEffect from './shaders/meter.wgsl';
import { PRIMITIVE_FLOATS } from './stream';
import { UIEffects } from './UIEffects';
import { UIInput } from './UIInput';
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
 * Draws surfaces in order, each in one draw call per run of an effect. Boxes,
 * text and icons share the plain rect pipeline.
 */
export class UIRenderer {
  /** Draw calls in the last render. */
  drawCalls = 0;
  readonly effects: UIEffects;
  /** Sends input to the surfaces. Attach it to the canvas the UI draws on. */
  readonly input = new UIInput(this);
  private _surfaces: UISurface[] = [];
  private buffers = new Map<UISurface, SurfaceBuffers>();
  private bindGroupLayout: GPUBindGroupLayout;
  private uniforms: GPUBuffer;
  private runs: DrawRun[] = [];
  private _font: UIFont | null = null;
  private _icons: UIIcons | null = null;
  private sampler: GPUSampler;
  /** Bound in place of an atlas until there is a font or icons. */
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
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    this.sampler = device.createSampler({
      label: 'ui-atlas',
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
    for (const surface of this._surfaces) surface.font = font;
    this.rebindAtlases();
  }

  /**
   * The icons every surface draws with. The renderer does not own them, so it
   * does not dispose them.
   */
  get icons(): UIIcons | null {
    return this._icons;
  }

  set icons(icons: UIIcons | null) {
    if (icons === this._icons) return;
    this._icons = icons;
    for (const surface of this._surfaces) surface.icons = icons;
    this.rebindAtlases();
  }

  /** The surfaces in draw order, from bottom to top. */
  get surfaces(): readonly UISurface[] {
    return this._surfaces;
  }

  createSurface(options: UISurfaceOptions): UISurface {
    const surface = new UISurface(options);
    surface.font = this._font;
    surface.icons = this._icons;
    this._surfaces.push(surface);
    this._surfaces.sort((a, b) => a.order - b.order);
    return surface;
  }

  removeSurface(surface: UISurface): void {
    const index = this._surfaces.indexOf(surface);
    if (index !== -1) this._surfaces.splice(index, 1);
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
    for (const surface of this._surfaces) {
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
    this.input.detach();
    for (const { buffer } of this.buffers.values()) buffer.destroy();
    this.buffers.clear();
    this.uniforms.destroy();
    this.emptyAtlas.destroy();
  }

  private rebindAtlases(): void {
    for (const buffers of this.buffers.values())
      buffers.bindGroup = this.createBindGroup(buffers.buffer);
  }

  private createBindGroup(buffer: GPUBuffer): GPUBindGroup {
    const fontAtlas = this._font?.texture ?? this.emptyAtlas;
    const iconAtlas = this._icons?.texture ?? this.emptyAtlas;
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: fontAtlas.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: iconAtlas.createView() },
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
