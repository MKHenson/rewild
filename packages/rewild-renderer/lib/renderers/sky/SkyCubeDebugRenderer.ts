import type { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/skyCubeDebug.wgsl';
import { CUBE_FACE_COUNT } from './SkyCaptureScheduler';
import { SKY_CUBE_MIP_COUNT } from './SkyCubeCapture';

/** Three rows of six faces, plus one quad for the BRDF map. */
const TILE_COUNT = CUBE_FACE_COUNT * 3 + 1;

/**
 * Draws the whole IBL chain as tiled cube faces along the bottom of the screen:
 * the captured sky, the diffuse irradiance cube, the prefiltered specular cube
 * at a selectable roughness level, and the BRDF integration map.
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

  /**
   * Which specular mip the third row shows — i.e. which roughness. Stepping it
   * through the chain is how you check the prefilter blurs monotonically
   * rather than, say, sampling the wrong source level at one end.
   */
  specularMip: number = 0;

  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private uniformData = new Float32Array(4);

  init(
    renderer: Renderer,
    capturedCube: GPUTexture,
    irradianceCube: GPUTexture,
    specularCube: GPUTexture,
    brdfLut: GPUTexture
  ): void {
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

    const sampler = renderer.samplerManager.get('linear-clamped');

    this.bindGroup = device.createBindGroup({
      label: 'sky cube debug bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: capturedCube.createView({ dimension: 'cube' }),
        },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
        {
          binding: 3,
          resource: irradianceCube.createView({ dimension: 'cube' }),
        },
        {
          binding: 4,
          resource: specularCube.createView({ dimension: 'cube' }),
        },
        { binding: 5, resource: brdfLut.createView() },
      ],
    });
  }

  render(renderer: Renderer): void {
    if (!this.enabled || !this.pipeline || !this.bindGroup) return;

    // Read live rather than cached: setExposure() from the console is exactly
    // the kind of thing you would be doing while this viewer is up.
    this.uniformData[0] = renderer.camera.camera.exposure * this.exposureBias;
    this.uniformData[1] = Math.max(
      0,
      Math.min(SKY_CUBE_MIP_COUNT - 1, this.specularMip)
    );
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
    pass.draw(6 * TILE_COUNT);
    pass.end();
    renderer.device.queue.submit([encoder.finish()]);
  }
}
