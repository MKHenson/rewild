import { Renderer } from '../../Renderer';
import bilateralShader from '../../shaders/sky/skyBilateral.wgsl';

// Uniform layout (matches SkyBilateralUniforms in skyBilateral.wgsl):
//   resolution        : vec2<f32>    offset  0, size  8
//   sigmaSpatial      : f32          offset  8, size  4
//   sigmaRange        : f32          offset 12, size  4
//   sigmaFar          : f32          offset 16, size  4
//   _pad0             : f32          offset 20, size  4
//   _pad1             : vec2<f32>    offset 24, size  8  → aligns mat4 to 32
//   invViewProjMatrix : mat4x4<f32>  offset 32, size 64
// Total: 96 bytes → aligned to 256
const UNIFORM_BYTE_SIZE = 96;
const ALIGNED_UNIFORM_SIZE = Math.ceil(UNIFORM_BYTE_SIZE / 256) * 256;

/**
 * Single-pass bilateral filter for cloud edge-preserving softening.
 *
 * Reads from `sourceTexture` (the bloom pass output, rgba8unorm) and writes
 * a filtered rgba8unorm texture at the same resolution.
 *
 * The range weight (sigmaRange) preserves cloud-sky edges.  The spatial sigma
 * blends from sigmaSpatial (overhead, close clouds) to sigmaFar (horizon,
 * distant clouds) based on the reconstructed ray direction — so distant clouds
 * receive heavier softening without blurring nearby cloud detail.
 *
 * sigmaSpatial: blur radius for overhead clouds (default 3.0 texels)
 * sigmaFar:     blur radius for horizon clouds  (default 6.0 texels)
 * sigmaRange:   luminance edge-stop (default 0.05 — lower = sharper edges)
 */
export class SkyBilateralPass {
  renderTarget: GPUTexture;
  sourceTexture: GPUTexture | null;

  /**
   * sigmaSpatial: Blur radius (in texels) for overhead/nearby clouds.
   * Higher values increase softening of close cloud edges.
   * Default: 4.0
   */
  sigmaSpatial: number = 1.5;

  /**
   * sigmaRange: Edge-stop in log-luminance space (fog-independent).
   * The shader compares log(1+lum) rather than raw HDR luminance, so this value
   * is stable regardless of foginess. A cloud-sky boundary always produces a
   * log-diff of ~1.9; within-cloud temporal artifacts produce ~0.1–0.2.
   * - 0.5: sharp cloud edges, only internal cloud noise blended
   * - 1.5: some boundary blending (averages the 2×2 temporal checkerboard at edges)
   * - 3.0: very soft edges, heavy blending across cloud-sky boundaries
   * Default: 1.5
   */
  sigmaRange: number = 0.5;

  /**
   * sigmaFar: Blur radius (in texels) for distant/horizon clouds.
   * Must be >= sigmaSpatial so the Gaussian widens with distance rather than
   * shrinking (which was the original bug that left medium-distance clouds pixelated).
   * Default: 6.0
   */
  sigmaFar: number = 1.5;

  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;

  constructor() {
    this.sourceTexture = null;
  }

  init(renderer: Renderer): void {
    const { device } = renderer;
    const src = this.sourceTexture!;
    const w = src.width;
    const h = src.height;

    const module = device.createShaderModule({
      label: 'sky bilateral shader',
      code: bilateralShader,
    });

    this.renderTarget = device.createTexture({
      size: [w, h, 1],
      label: 'sky bilateral output',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'sky bilateral pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    this.uniformBuffer = device.createBuffer({
      label: 'sky bilateral uniforms',
      size: ALIGNED_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = renderer.samplerManager.get('linear-clamped');
    this.bindGroup = device.createBindGroup({
      label: 'sky bilateral bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: src.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  render(
    renderer: Renderer,
    invViewProjMatrix: Float32Array | number[],
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    const { device } = renderer;
    const w = this.renderTarget.width;
    const h = this.renderTarget.height;

    const uData = new Float32Array(ALIGNED_UNIFORM_SIZE / 4);
    uData[0] = w;
    uData[1] = h;
    uData[2] = this.sigmaSpatial;
    uData[3] = this.sigmaRange;
    uData[4] = this.sigmaFar;
    // uData[5..7] = padding
    uData.set(invViewProjMatrix, 8); // invViewProjMatrix at offset 32 bytes (index 8)
    device.queue.writeBuffer(this.uniformBuffer, 0, uData.buffer);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.renderTarget?.destroy();
    this.uniformBuffer?.destroy();
  }
}
