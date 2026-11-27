import { Matrix4 } from 'rewild-common';
import type { UIFont } from './font';
import type { UIIcons } from './icons';
import { NO_TEXTURE } from './image';
import meterEffect from './shaders/meter.wgsl';
import gaugeEffect from './shaders/gauge.wgsl';
import hologramEffect from './shaders/hologram.wgsl';
import { PRIMITIVE_FLOATS, primitiveRuns } from './stream';
import { UITheme } from './theme';
import { UIBackdrop, UIBackdropSource } from './UIBackdrop';
import { UICarry } from './UICarry';
import { UIEffects } from './UIEffects';
import { UIImages } from './UIImages';
import { UIInput } from './UIInput';
import { UISurface, UISurfaceOptions } from './UISurface';
import { outsideView, screenClip, worldClip } from './world';

export interface UIViewport {
  /** The target size in device pixels. */
  width: number;
  height: number;
  pixelRatio: number;
}

/** Where world surfaces draw: into the scene, tested against its depth. */
export interface UIWorldTarget {
  view: GPUTextureView;
  /** The scene's depth. The surfaces test it and do not write it. */
  depthView: GPUTextureView;
  /** The target size in device pixels. */
  width: number;
  height: number;
  /** The camera's projection times its view matrix. */
  viewProjection: Matrix4;
}

/** What the last render cost. */
export interface UIStats {
  surfaces: number;
  nodes: number;
  primitives: number;
  drawCalls: number;
  /** Surfaces that laid out. */
  layouts: number;
  /** Milliseconds of layout, over all surfaces. */
  layoutTime: number;
  /** Surfaces that wrote their stream. */
  writes: number;
  /** Milliseconds of stream writes, over all surfaces. */
  writeTime: number;
  /** Images loaded, small and large. */
  images: number;
  /** Bytes of GPU memory the images take. */
  imageBytes: number;
}

/**
 * `timestampWrites` for the UI's passes. Each function is called only when
 * its pass begins, so a frame with no glass does not count a blur.
 */
export interface UITimestampWrites {
  /** Brackets all the blur passes, from the start of the first to the end of the last. */
  blur?: () => GPURenderPassTimestampWrites | undefined;
  draw?: () => GPURenderPassTimestampWrites | undefined;
  world?: () => GPURenderPassTimestampWrites | undefined;
}

interface SurfaceBuffers {
  buffer: GPUBuffer;
  /** The screen surfaces share one. Each world surface has its own. */
  uniforms: GPUBuffer;
  bindGroup: GPUBindGroup;
}

/** Floats in the uniforms. Matches `Uniforms` in ui.wgsl. */
const UNIFORM_FLOATS = 24;

/** A run of primitives in one surface that share a pipeline and an image texture. */
interface DrawRun {
  bindGroup: GPUBindGroup;
  /** The image texture, as `UIImage.texture`, or `NO_TEXTURE` for a run with no image. */
  texture: number;
  pipeline: GPURenderPipeline;
  first: number;
  count: number;
}

/**
 * Draws surfaces in order, each in one draw call per run of an effect. Boxes,
 * text and icons share the plain rect pipeline. Screen surfaces draw over the
 * frame in `render`. World surfaces draw in the scene in `renderWorld`, which
 * runs before `render` in a frame.
 */
export class UIRenderer {
  /** Draw calls in the last render. */
  drawCalls = 0;
  /** What the last render cost. */
  readonly stats: UIStats = {
    surfaces: 0,
    nodes: 0,
    primitives: 0,
    drawCalls: 0,
    layouts: 0,
    layoutTime: 0,
    writes: 0,
    writeTime: 0,
    images: 0,
    imageBytes: 0,
  };
  /** Times the UI's passes on the GPU, when set. */
  timestampWrites: UITimestampWrites | null = null;
  readonly effects: UIEffects;
  /**
   * The images that image nodes draw, by name. Each surface lays out and
   * draws again when one loads or goes.
   */
  readonly images: UIImages;
  /** Sends input to the surfaces. Attach it to the canvas the UI draws on. */
  readonly input = new UIInput(this);
  /** Carries one item at most from slot to slot. Its ghost draws on its own surface. */
  readonly carry: UICarry;
  /**
   * The DOM's theme colours. In a page, it reads them at the start and again
   * when the theme changes.
   */
  readonly theme = new UITheme();
  /**
   * What glass blurs: the image the UI draws over, the size of the target.
   * Set it before each render. With none, glass shows no backdrop.
   */
  backdrop: UIBackdropSource | null = null;
  private blur: UIBackdrop;
  private boundBackdrop: GPUTexture | null = null;
  private stopWatchingTheme: () => void = () => {};
  private _surfaces: UISurface[] = [];
  private buffers = new Map<UISurface, SurfaceBuffers>();
  private bindGroupLayout: GPUBindGroupLayout;
  private uniforms: GPUBuffer;
  private uniformData = new Float32Array(UNIFORM_FLOATS);
  private clip = new Matrix4();
  private runs: DrawRun[] = [];
  /** True when the last `renderWorld` drew glass, so `render` blurs for the next frame. */
  private worldGlass = false;
  /** Draw calls in the last `renderWorld`, which `render` adds to its stats. */
  private worldDrawCalls = 0;
  /** World surfaces with no depth test, in view, for `render` to draw. */
  private over: UISurface[] = [];
  private readonly overViewProjection = new Matrix4();
  private _font: UIFont | null = null;
  private _icons: UIIcons | null = null;
  private _showLayout = false;
  private sampler: GPUSampler;
  /** Bound in place of an atlas until there is a font or icons. */
  private emptyAtlas: GPUTexture;

  /**
   * Both kinds of surface draw into targets of `format`. World surfaces test
   * a scene depth of `depthFormat`.
   */
  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
    depthFormat: GPUTextureFormat = 'depth24plus'
  ) {
    const visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'ui',
      entries: [
        { binding: 0, visibility, buffer: { type: 'uniform' } },
        { binding: 1, visibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
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
    this.images = new UIImages(device);
    this.images.addListener(() => {
      for (const surface of this._surfaces) {
        surface.needsLayout = true;
        surface.needsPaint = true;
      }
    });
    const layout = device.createPipelineLayout({
      label: 'ui',
      bindGroupLayouts: [this.bindGroupLayout, this.images.bindGroupLayout],
    });
    this.effects = new UIEffects(device, format, layout, depthFormat);
    this.effects.register('meter', meterEffect);
    this.effects.register('gauge', gaugeEffect);
    this.effects.registerSurface('hologram', hologramEffect);
    this.uniforms = this.createUniforms('ui-uniforms');
    this.blur = new UIBackdrop(device);
    this.carry = new UICarry(this, this.input);
    if (typeof document !== 'undefined') {
      this.theme.read();
      this.stopWatchingTheme = this.theme.watch();
    }
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
    this.rebind();
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
    this.rebind();
  }

  /** Draws the layout overlay over every surface. */
  get showLayout(): boolean {
    return this._showLayout;
  }

  set showLayout(value: boolean) {
    this._showLayout = value;
    for (const surface of this._surfaces) surface.showLayout = value;
  }

  /** The surfaces in draw order, from bottom to top. */
  get surfaces(): readonly UISurface[] {
    return this._surfaces;
  }

  createSurface(options: UISurfaceOptions): UISurface {
    return this.addSurface(new UISurface(options));
  }

  /**
   * Draws a surface made elsewhere, and sends input to it. It can come back
   * after `removeSurface`: it paints again, because its buffers are gone.
   */
  addSurface(surface: UISurface): UISurface {
    if (this._surfaces.includes(surface)) return surface;
    surface.font = this._font;
    surface.icons = this._icons;
    surface.images = this.images;
    surface.theme = this.theme;
    surface.showLayout = this._showLayout;
    surface.needsPaint = true;
    this._surfaces.push(surface);
    this._surfaces.sort((a, b) => a.order - b.order);
    return surface;
  }

  removeSurface(surface: UISurface): void {
    const index = this._surfaces.indexOf(surface);
    if (index !== -1) this._surfaces.splice(index, 1);
    // Its nodes give back their images, which go into the cache.
    if (surface.images === this.images) surface.images = null;
    const buffers = this.buffers.get(surface);
    if (buffers) this.destroyBuffers(buffers);
    this.buffers.delete(surface);
  }

  /** True when a transition is running, so the UI must draw again on the next frame. */
  get animating(): boolean {
    return this._surfaces.some((surface) => surface.needsPaint);
  }

  /**
   * Draws the world surfaces into the scene, far ones first. Call it once per
   * frame, before `render`. Glass reads the blur that `render` made in the
   * last frame, since this frame's blur does not exist yet. A surface wholly
   * out of view lays out but does not draw.
   */
  renderWorld(encoder: GPUCommandEncoder, target: UIWorldTarget): void {
    const now = performance.now();
    const shown: { surface: UISurface; bindGroup: GPUBindGroup; w: number }[] =
      [];
    this.worldGlass = false;
    this.over.length = 0;
    this.overViewProjection.copy(target.viewProjection);
    for (const surface of this._surfaces) {
      if (surface.kind !== 'world') continue;
      const width = surface.layoutWidth;
      const height = surface.layoutHeight;
      surface.update(width, height, 1, now);
      this.upload(surface);
      const buffers = this.buffers.get(surface);
      if (!buffers || !surface.stream.count) continue;
      const clip = worldClip(
        this.clip,
        target.viewProjection,
        surface.worldMatrix,
        surface.size,
        surface.pixelsPerMetre
      );
      if (outsideView(clip, width, height)) continue;
      if (surface.stream.glass > 0) this.worldGlass = true;
      // A surface over the scene draws in `render`, at the screen's
      // resolution, which can be higher than the scene's.
      if (!surface.depthTest) {
        this.over.push(surface);
        continue;
      }
      this.writeUniforms(
        buffers.uniforms,
        width,
        height,
        1,
        target,
        clip,
        true,
        surface.effectValue
      );
      // The distance to the centre, along the view.
      const e = clip.elements;
      const w = e[3] * (width / 2) + e[7] * (height / 2) + e[15];
      shown.push({ surface, bindGroup: buffers.bindGroup, w });
    }
    // The surfaces do not write depth, so the far ones draw first.
    shown.sort((a, b) => b.w - a.w);
    const runs = this.runs;
    runs.length = 0;
    for (const { surface, bindGroup } of shown)
      this.addRuns(surface, bindGroup, true);

    this.worldDrawCalls = 0;
    if (!runs.length) return;
    const pass = encoder.beginRenderPass({
      label: 'ui world',
      timestampWrites: this.timestampWrites?.world?.(),
      colorAttachments: [
        { view: target.view, loadOp: 'load', storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: target.depthView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      },
    });
    this.worldDrawCalls = this.drawRuns(pass);
    pass.end();
  }

  /**
   * Draws the screen surfaces into `view`. Clears it first when `clearValue`
   * is given, or else draws over what is there. With no `clearValue` and
   * nothing to draw, it starts no pass. When glass shows on a screen surface,
   * or on a world surface in this frame's `renderWorld`, it blurs the
   * backdrop first.
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
    this.writeUniforms(
      this.uniforms,
      width,
      height,
      pixelRatio,
      viewport,
      screenClip(this.clip, width, height),
      false
    );

    const now = performance.now();
    this.carry.update();
    let glass = this.worldGlass;
    for (const surface of this._surfaces) {
      if (surface.kind !== 'screen') continue;
      surface.update(width, height, pixelRatio, now);
      this.upload(surface);
      if (surface.stream.glass > 0) glass = true;
    }
    this.countStats();
    // The blur runs only when glass shows.
    if (glass && this.backdrop) {
      // Backdrop pixels per CSS pixel. The backdrop can be smaller than the target.
      const backdropRatio = this.backdrop.texture.width / width;
      this.blur.render(
        encoder,
        this.backdrop,
        backdropRatio,
        this.timestampWrites?.blur?.()
      );
      if (this.blur.texture !== this.boundBackdrop) this.rebind();
    }

    // Find the pipelines before the pass, so an unknown effect throws
    // with no pass left open.
    const runs = this.runs;
    runs.length = 0;
    this.addOverRuns(viewport);
    for (const surface of this._surfaces) {
      const buffers = this.buffers.get(surface);
      if (surface.kind === 'screen' && buffers)
        this.addRuns(surface, buffers.bindGroup, false);
    }

    // The world surfaces drew earlier in the frame.
    this.drawCalls = this.worldDrawCalls;
    this.worldDrawCalls = 0;
    this.worldGlass = false;
    this.stats.drawCalls = this.drawCalls;
    if (!runs.length && !clearValue) return;
    const pass = encoder.beginRenderPass({
      label: 'ui',
      timestampWrites: this.timestampWrites?.draw?.(),
      colorAttachments: [
        {
          view,
          clearValue,
          loadOp: clearValue ? 'clear' : 'load',
          storeOp: 'store',
        },
      ],
    });
    this.drawCalls += this.drawRuns(pass);
    this.stats.drawCalls = this.drawCalls;
    pass.end();
  }

  dispose(): void {
    this.input.detach();
    this.stopWatchingTheme();
    this.blur.dispose();
    for (const surface of this._surfaces) surface.images = null;
    this.images.dispose();
    for (const buffers of this.buffers.values()) this.destroyBuffers(buffers);
    this.buffers.clear();
    this.uniforms.destroy();
    this.emptyAtlas.destroy();
  }

  /**
   * Counts what the surfaces cost in their last update. A world surface
   * updates in `renderWorld`, earlier in the frame.
   */
  private countStats(): void {
    const stats = this.stats;
    stats.surfaces = this._surfaces.length;
    stats.nodes = stats.primitives = 0;
    stats.layouts = stats.layoutTime = stats.writes = stats.writeTime = 0;
    for (const surface of this._surfaces) {
      stats.nodes += surface.nodeCount;
      stats.primitives += surface.stream.count;
      if (surface.laidOut) stats.layouts++;
      if (surface.wrote) stats.writes++;
      stats.layoutTime += surface.layoutTime;
      stats.writeTime += surface.writeTime;
    }
    const images = this.images.stats;
    stats.images = images.small + images.large;
    stats.imageBytes = images.bytes;
  }

  /**
   * Adds the runs of the world surfaces that skip the depth test, far ones
   * first, to draw under the screen surfaces at the screen's resolution.
   */
  private addOverRuns(viewport: UIViewport): void {
    const over = this.over;
    const shown: { surface: UISurface; bindGroup: GPUBindGroup; w: number }[] =
      [];
    for (const surface of over) {
      const buffers = this.buffers.get(surface);
      if (!buffers) continue;
      const width = surface.layoutWidth;
      const height = surface.layoutHeight;
      const clip = worldClip(
        this.clip,
        this.overViewProjection,
        surface.worldMatrix,
        surface.size,
        surface.pixelsPerMetre
      );
      this.writeUniforms(
        buffers.uniforms,
        width,
        height,
        1,
        viewport,
        clip,
        true,
        surface.effectValue
      );
      const e = clip.elements;
      const w = e[3] * (width / 2) + e[7] * (height / 2) + e[15];
      shown.push({ surface, bindGroup: buffers.bindGroup, w });
    }
    over.length = 0;
    shown.sort((a, b) => b.w - a.w);
    for (const { surface, bindGroup } of shown)
      this.addRuns(surface, bindGroup, true);
  }

  /**
   * Adds the surface's runs of primitives that share an effect and an image
   * texture to `runs`. A primitive with no image joins any run.
   */
  private addRuns(
    surface: UISurface,
    bindGroup: GPUBindGroup,
    world: boolean
  ): void {
    for (const { first, count, effect, texture } of primitiveRuns(
      surface.stream
    ))
      this.runs.push({
        bindGroup,
        texture,
        pipeline: this.effects.pipeline(
          effect,
          surface.effect,
          world,
          surface.depthTest
        ),
        first,
        count,
      });
  }

  /** Draws `runs` into the pass. Returns the number of draw calls. */
  private drawRuns(pass: GPURenderPassEncoder): number {
    let bindGroup: GPUBindGroup | null = null;
    let imageGroup: GPUBindGroup | null = null;
    let pipeline: GPURenderPipeline | null = null;
    for (const run of this.runs) {
      if (run.pipeline !== pipeline) pass.setPipeline(run.pipeline);
      if (run.bindGroup !== bindGroup) pass.setBindGroup(0, run.bindGroup);
      // A run with no image keeps the texture bound before it.
      if (run.texture !== NO_TEXTURE || !imageGroup) {
        const group = this.images.bindGroup(run.texture);
        if (group !== imageGroup) pass.setBindGroup(1, group);
        imageGroup = group;
      }
      pipeline = run.pipeline;
      bindGroup = run.bindGroup;
      pass.draw(4, run.count, 0, run.first);
    }
    return this.runs.length;
  }

  private createUniforms(label: string): GPUBuffer {
    return this.device.createBuffer({
      label,
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Writes `Uniforms` in ui.wgsl. `target` is in device pixels. */
  private writeUniforms(
    buffer: GPUBuffer,
    width: number,
    height: number,
    pixelRatio: number,
    target: { width: number; height: number },
    clip: Matrix4,
    world: boolean,
    effectValue = 1
  ): void {
    const d = this.uniformData;
    d[0] = width;
    d[1] = height;
    d[2] = pixelRatio;
    d[3] = performance.now() / 1000;
    d[4] = target.width;
    d[5] = target.height;
    d[6] = world ? 1 : 0;
    d[7] = effectValue;
    d.set(clip.elements, 8);
    this.device.queue.writeBuffer(buffer, 0, d);
  }

  private destroyBuffers(buffers: SurfaceBuffers): void {
    buffers.buffer.destroy();
    if (buffers.uniforms !== this.uniforms) buffers.uniforms.destroy();
  }

  /** Binds the atlases and the backdrop again, after one of them changed. */
  private rebind(): void {
    for (const buffers of this.buffers.values())
      buffers.bindGroup = this.createBindGroup(
        buffers.buffer,
        buffers.uniforms
      );
  }

  private createBindGroup(
    buffer: GPUBuffer,
    uniforms: GPUBuffer
  ): GPUBindGroup {
    const fontAtlas = this._font?.texture ?? this.emptyAtlas;
    const iconAtlas = this._icons?.texture ?? this.emptyAtlas;
    this.boundBackdrop = this.blur.texture;
    const backdrop = this.blur.texture ?? this.emptyAtlas;
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: fontAtlas.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: iconAtlas.createView() },
        { binding: 5, resource: backdrop.createView() },
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
      // Each world surface has its own place in the world, so its own uniforms.
      const uniforms =
        buffers?.uniforms ??
        (surface.kind === 'world'
          ? this.createUniforms(`ui-${surface.name}-uniforms`)
          : this.uniforms);
      buffers = {
        buffer,
        uniforms,
        bindGroup: this.createBindGroup(buffer, uniforms),
      };
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
