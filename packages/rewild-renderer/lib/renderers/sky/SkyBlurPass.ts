import { Renderer } from '../../Renderer';
import blurShader from '../../shaders/sky/skyBlur.wgsl';

// Uniform layout (matches SkyBlurUniforms in skyBlur.wgsl):
//   resolution : vec2<f32>  (8 bytes)
//   blurSigma  : f32        (4 bytes)
//   horizontal : f32        (4 bytes)
// Total: 16 bytes → aligned to 256
const UNIFORM_BYTE_SIZE = 16;
const ALIGNED_UNIFORM_SIZE = Math.ceil(UNIFORM_BYTE_SIZE / 256) * 256;

/**
 * Two-pass separable Gaussian blur for cloud edge softening.
 *
 * Reads from `sourceTexture` (the temporal cloud render target, rgba16float)
 * and writes a blurred rgba16float texture at the same resolution.
 *
 * The pass runs horizontal then vertical in a single render() call, using
 * an intermediate ping-pong texture so no extra GPU submissions are needed.
 *
 * blurSigma controls the softness (Gaussian σ in texels).  Try 2.0–4.0:
 *   2.0 = subtle softening (preserves more cloud detail)
 *   3.0 = balanced fluffiness  ← default
 *   5.0 = heavy soft-focus
 */
export class SkyBlurPass {
  renderTarget: GPUTexture; // output (blurred cloud texture)
  sourceTexture: GPUTexture | null; // set by SkyRenderer before init()

  /** Gaussian sigma in texels.  Increase for fluffier clouds. */
  blurSigma: number = 1.0;

  private hPipeline: GPURenderPipeline;
  private vPipeline: GPURenderPipeline;
  private hBindGroup: GPUBindGroup;
  private vBindGroup: GPUBindGroup;
  private hUniformBuffer: GPUBuffer;
  private vUniformBuffer: GPUBuffer;
  private pingTexture: GPUTexture; // intermediate after horizontal pass
  constructor() {
    this.sourceTexture = null;
  }

  init(renderer: Renderer): void {
    const { device } = renderer;
    const src = this.sourceTexture!;
    const w = src.width;
    const h = src.height;

    const module = device.createShaderModule({
      label: 'sky blur shader',
      code: blurShader,
    });

    // ── Textures ──
    // ping: receives horizontal pass output
    this.pingTexture = device.createTexture({
      size: [w, h, 1],
      label: 'sky blur ping',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // renderTarget: receives vertical pass output (final blurred clouds)
    this.renderTarget = device.createTexture({
      size: [w, h, 1],
      label: 'sky blur output',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const pipelineDesc = (label: string): GPURenderPipelineDescriptor => ({
      label,
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    this.hPipeline = device.createRenderPipeline(pipelineDesc('sky blur H'));
    this.vPipeline = device.createRenderPipeline(pipelineDesc('sky blur V'));

    // ── Uniform buffers ──
    this.hUniformBuffer = device.createBuffer({
      label: 'sky blur H uniforms',
      size: ALIGNED_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.vUniformBuffer = device.createBuffer({
      label: 'sky blur V uniforms',
      size: ALIGNED_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = renderer.samplerManager.get('linear-clamped');

    // Horizontal: source → ping
    this.hBindGroup = device.createBindGroup({
      label: 'sky blur H bind group',
      layout: this.hPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: src.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.hUniformBuffer } },
      ],
    });

    // Vertical: ping → renderTarget
    this.vBindGroup = device.createBindGroup({
      label: 'sky blur V bind group',
      layout: this.vPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.pingTexture.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.vUniformBuffer } },
      ],
    });
  }

  render(renderer: Renderer): void {
    const { device } = renderer;
    const w = this.renderTarget.width;
    const h = this.renderTarget.height;
    const sigma = this.blurSigma;

    // Upload horizontal uniforms: resolution, sigma, horizontal=1
    const hData = new Float32Array(ALIGNED_UNIFORM_SIZE / 4);
    hData[0] = w;
    hData[1] = h;
    hData[2] = sigma;
    hData[3] = 1.0;
    device.queue.writeBuffer(this.hUniformBuffer, 0, hData.buffer);

    // Upload vertical uniforms: resolution, sigma, horizontal=0
    const vData = new Float32Array(ALIGNED_UNIFORM_SIZE / 4);
    vData[0] = w;
    vData[1] = h;
    vData[2] = sigma;
    vData[3] = 0.0;
    device.queue.writeBuffer(this.vUniformBuffer, 0, vData.buffer);

    const encoder = device.createCommandEncoder();

    // Horizontal pass → pingTexture
    const hPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.pingTexture.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    hPass.setPipeline(this.hPipeline);
    hPass.setBindGroup(0, this.hBindGroup);
    hPass.draw(6);
    hPass.end();

    // Vertical pass → renderTarget
    const vPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    vPass.setPipeline(this.vPipeline);
    vPass.setBindGroup(0, this.vBindGroup);
    vPass.draw(6);
    vPass.end();

    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.renderTarget?.destroy();
    this.pingTexture?.destroy();
    this.hUniformBuffer?.destroy();
    this.vUniformBuffer?.destroy();
  }
}
