import { Renderer } from '..';
import shader from '../shaders/frame-compositing/upscale.wgsl';

/**
 * The tone-mapped frame at the scene size, and the pass that scales it to the
 * canvas. Used only while the scene size differs from the canvas size: the
 * tone map, rain, lightning and overlays draw into `view` with the scene
 * depth, then `render` fills the canvas for the UI to draw over.
 */
export class FrameUpscalePass {
  texture: GPUTexture | null = null;
  view: GPUTextureView | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;

  /** Sizes the frame texture to the scene, or frees it when `needed` is false. */
  prepare(renderer: Renderer, needed: boolean): void {
    const { sceneWidth, sceneHeight } = renderer;
    if (!needed) {
      this.release();
      return;
    }
    const texture = this.texture;
    if (
      texture &&
      texture.width === sceneWidth &&
      texture.height === sceneHeight
    )
      return;

    texture?.destroy();
    const { device, presentationFormat } = renderer;
    this.texture = device.createTexture({
      label: 'frame-ldr',
      size: [sceneWidth, sceneHeight],
      format: presentationFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.view = this.texture.createView();

    if (!this.pipeline) {
      const module = device.createShaderModule({
        label: 'frame upscale shader',
        code: shader,
      });
      this.pipeline = device.createRenderPipeline({
        label: 'frame upscale pipeline',
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{ format: presentationFormat }],
        },
      });
    }

    this.bindGroup = device.createBindGroup({
      label: 'frame upscale bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.view },
        { binding: 1, resource: renderer.samplerManager.get('linear-clamped') },
      ],
    });
  }

  /** Draws the frame texture over all of `target`. */
  render(renderer: Renderer, target: GPUTextureView): void {
    if (!this.pipeline || !this.bindGroup) return;

    const encoder = renderer.device.createCommandEncoder({
      label: 'frame upscale encoder',
    });
    const pass = encoder.beginRenderPass({
      label: 'frame upscale',
      colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    renderer.device.queue.submit([encoder.finish()]);
  }

  private release(): void {
    this.texture?.destroy();
    this.texture = null;
    this.view = null;
    this.bindGroup = null;
  }

  dispose(): void {
    this.release();
    this.pipeline = null;
  }
}
