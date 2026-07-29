import { Renderer } from '..';
import sceneOutputShader from '../shaders/scene-output.wgsl';

/**
 * Transfers the HDR scene colour target to the swapchain.
 *
 * The scene pass renders terrain and meshes into an `rgba16float` target so
 * shaded values above 1.0 survive shading instead of being clipped at write
 * time. Nothing can be displayed from that target directly — the swapchain is
 * an 8-bit unorm format — so this pass performs the transfer.
 *
 * Right now the transfer is a 1:1 texel copy and the unorm target clamps to
 * [0, 1], which is precisely what the old direct-to-swapchain scene pass did.
 * The displayed image is unchanged; what changes is that the HDR values now
 * exist and can be read by a later stage.
 *
 * This is the stage that becomes the whole-frame ACES tonemap + exposure step
 * once that work moves out of the sky composite.
 */
export class SceneOutputPass {
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup | null = null;

  init(renderer: Renderer): void {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      label: 'scene output shader',
      code: sceneOutputShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'scene output pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        // Writes to the swapchain, so this stays at the presentation format
        // while the scene pass itself moves to HDR.
        targets: [{ format: presentationFormat }],
      },
    });
  }

  /**
   * Rebinds the source texture. Must be called whenever the scene colour
   * target is recreated, which happens on every canvas resize.
   */
  setSceneTexture(renderer: Renderer, view: GPUTextureView): void {
    this.bindGroup = renderer.device.createBindGroup({
      label: 'scene output bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: view }],
    });
  }

  render(encoder: GPUCommandEncoder, targetView: GPUTextureView): void {
    if (!this.bindGroup) return;

    const pass = encoder.beginRenderPass({
      label: 'scene output pass',
      colorAttachments: [
        {
          view: targetView,
          // Every pixel is written by the fullscreen triangle, so the clear is
          // only here to give the attachment a defined load state.
          clearValue: [0.0, 0.0, 0.0, 1.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
  }

  dispose(): void {
    this.bindGroup = null;
  }
}
