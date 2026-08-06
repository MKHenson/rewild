import { Renderer } from '..';
import toneMapShader from '../shaders/frame-compositing/tonemap.wgsl';

const UNIFORM_BYTES = 16; // lightningFlash + exposure + bloomScale + 1 pad
const uniformData = new Float32Array(4);

/**
 * Whole-frame tonemap — the single point where HDR scene radiance becomes
 * displayable colour.
 *
 * Reads the HDR scene target (scene geometry, with sky, fog and god rays
 * already composited over it in HDR) plus the bloom highlights, applies
 * exposure, runs one ACES curve over the whole image and writes the swapchain.
 *
 * ACES used to live inside the sky composite, where only the sky's own
 * contribution passed through it — terrain was never tonemapped, and the two
 * were blended in different colour regimes. This pass is what replaces that.
 */
export class ToneMapPass {
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup | null = null;
  private uniformBuffer: GPUBuffer;
  private boundSceneTexture: GPUTexture | null = null;
  private boundBloomTexture: GPUTexture | null = null;

  init(renderer: Renderer): void {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      label: 'tonemap shader',
      code: toneMapShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'tonemap pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        // Writes the swapchain, so this is the one pass in the chain that stays
        // at the presentation format.
        targets: [{ format: presentationFormat }],
      },
    });

    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: 'tonemap uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Binds the source textures, rebuilding only when either has actually been
   * replaced. Both the scene target and the bloom target are recreated on canvas
   * resize, so comparing identities here is cheaper than trying to order an
   * explicit rebind against those lifecycles.
   */
  private ensureSources(
    renderer: Renderer,
    sceneTexture: GPUTexture,
    bloomTexture: GPUTexture
  ): void {
    if (
      this.bindGroup &&
      this.boundSceneTexture === sceneTexture &&
      this.boundBloomTexture === bloomTexture
    ) {
      return;
    }

    this.boundSceneTexture = sceneTexture;
    this.boundBloomTexture = bloomTexture;

    this.bindGroup = renderer.device.createBindGroup({
      label: 'tonemap bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sceneTexture.createView() },
        { binding: 1, resource: bloomTexture.createView() },
        { binding: 2, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  render(
    renderer: Renderer,
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    bloomTexture: GPUTexture
  ): void {
    const sceneTexture = renderer.sceneColorTarget;
    if (!sceneTexture || !bloomTexture) return;

    this.ensureSources(renderer, sceneTexture, bloomTexture);
    if (!this.bindGroup) return;

    uniformData[0] = renderer.sky?.skyRenderer?.lightningFlash ?? 0;
    // Read every frame rather than on change: it is one float in a buffer that
    // is already written each frame, so tracking dirtiness would cost more than
    // it saves and would be one more thing to get wrong.
    uniformData[1] = renderer.camera.camera.exposure;
    // Bloom is suppressed while a material debug channel is up. A debug
    // channel is scaled by 1/exposure so the tone curve sees its raw 0..1
    // value — which puts it at an exposure-adjusted luminance of up to 1.0,
    // ten times BloomPass.bloomThreshold. Left on, every channel blooms into a
    // featureless wash and the view that exists to be *measured* cannot be.
    uniformData[2] = renderer.materialDebugChannel === 0 ? 1 : 0;
    renderer.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      uniformData.buffer
    );

    const pass = encoder.beginRenderPass({
      label: 'tonemap pass',
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
    this.uniformBuffer?.destroy();
    this.bindGroup = null;
    this.boundSceneTexture = null;
    this.boundBloomTexture = null;
  }
}
