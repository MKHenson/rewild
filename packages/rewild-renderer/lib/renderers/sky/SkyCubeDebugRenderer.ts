import type { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/skyCubeDebug.wgsl';
import { CUBE_FACE_COUNT } from './SkyCaptureScheduler';

/**
 * Draws the captured sky cubemap's six faces as a strip along the bottom of the
 * screen. Follows ShadowDebugRenderer: its own encoder, straight onto the
 * swapchain after everything else, and completely inert until `enabled`.
 *
 * #200 extends this with rows for the irradiance and prefiltered-specular
 * cubes, which is why the console command is already named showIblCubes().
 */
export class SkyCubeDebugRenderer {
  enabled: boolean = false;

  /**
   * Multiplier on the camera's exposure. 1 makes a tile read exactly as that
   * part of the sky reads on screen, which is what you want for checking the
   * capture against the frame. Raise it to open up a night cube, whose
   * radiance is orders of magnitude below what daytime exposure is tuned for.
   */
  exposureBias: number = 1;

  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private uniformData = new Float32Array(4);

  init(renderer: Renderer, cubemap: GPUTexture): void {
    const { device, presentationFormat } = renderer;

    if (!this.pipeline) {
      const module = device.createShaderModule({
        label: 'sky cube debug shader',
        code: shader,
      });

      this.pipeline = device.createRenderPipeline({
        label: 'sky cube debug pipeline',
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{ format: presentationFormat }],
        },
      });
    }

    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: 'sky cube debug uniforms',
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'sky cube debug bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: cubemap.createView({ dimension: 'cube' }) },
        { binding: 1, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  render(renderer: Renderer): void {
    if (!this.enabled || !this.pipeline || !this.bindGroup) return;

    // Read live rather than cached: setExposure() from the console is exactly
    // the kind of thing you would be doing while this viewer is up.
    this.uniformData[0] = renderer.camera.camera.exposure * this.exposureBias;
    renderer.device.queue.writeBuffer(
      this.uniformBuffer!,
      0,
      this.uniformData.buffer
    );

    const encoder = renderer.device.createCommandEncoder({
      label: 'sky cube debug encoder',
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: renderer.getCurrentTextureView(),
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6 * CUBE_FACE_COUNT);
    pass.end();
    renderer.device.queue.submit([encoder.finish()]);
  }
}
