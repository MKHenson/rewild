import { IPostProcess } from '../../../types/IPostProcess';
import { Renderer } from '../../Renderer';
import bloomShader from '../../shaders/sky/skyBloom.wgsl';
import temporalShader from '../../shaders/sky/skyBloomTemporal.wgsl';
import { PostProcessManager } from '../../post-processes/PostProcessManager';

const UNIFORM_FLOATS = 6; // resolution(2) + iTime + bloomAmount + bloomThreshold + horizontal
const ALIGNED_SIZE = Math.ceil((UNIFORM_FLOATS * 4) / 256) * 256;
const TEMPORAL_ALIGNED_SIZE = Math.ceil((1 * 4) / 256) * 256; // blendFactor f32

/** Bloom runs at this fraction of the canvas resolution. Half-res is sufficient
 *  for a blurry highlight pass and halves texture memory + bandwidth. */
const BLOOM_SCALE = 0.5;

/**
 * Three-pass bloom: horizontal extraction → vertical blur → temporal stabilization.
 *
 * Pass 1 reads the bilateral HDR cloud texture, extracts pixels above
 * bloomThreshold (exposure-adjusted luminance with a soft knee), and applies
 * a horizontal Gaussian blur → extractTarget.
 *
 * Pass 2 applies a vertical Gaussian blur on extractTarget → vPassTarget.
 *
 * Pass 3 blends vPassTarget with historyTexture (previous frame's stable
 * bloom) to suppress per-frame shimmer from cloud noise oscillating across
 * the threshold → renderTarget. renderTarget is then copied to historyTexture
 * for the next frame.
 */
export class SkyBloomPass implements IPostProcess {
  renderTarget: GPUTexture; // temporally stabilised HDR bloom (consumed by composite)
  manager: PostProcessManager;
  sourceTexture: GPUTexture | null; // set to bilateralPass.renderTarget before init()

  /** Scales the HDR highlight added to clouds before tonemapping.
   *  Range 0–3; default 1.2. Higher = brighter glow. */
  bloomAmount: number = 0.03;

  /** Threshold in exposure-adjusted luminance (EXPOSURE * raw_luminance).
   *  0.25 ≈ sunlit cloud tops; 0.4 ≈ only the very brightest highlights. */
  bloomThreshold: number = 0.2;

  /** History weight for temporal stabilization. Higher = smoother but slower
   *  to respond to new bright areas. Range 0–1; default 0.85. */
  temporalBlend: number = 0.7;

  private pipeline: GPURenderPipeline;
  private hBindGroup: GPUBindGroup;
  private vBindGroup: GPUBindGroup;
  private hUniforms: GPUBuffer;
  private vUniforms: GPUBuffer;
  private extractTarget: GPUTexture; // H-pass output
  private vPassTarget: GPUTexture; // V-pass output (input to temporal pass)

  private temporalPipeline: GPURenderPipeline;
  private temporalBindGroup: GPUBindGroup;
  private temporalUniforms: GPUBuffer;
  private historyTexture: GPUTexture; // previous frame's renderTarget

  private bw: number = 1; // scaled bloom width
  private bh: number = 1; // scaled bloom height

  constructor() {
    this.sourceTexture = null;
  }

  init(renderer: Renderer): IPostProcess {
    this.dispose();

    const { device, canvas } = renderer;

    const src = this.sourceTexture;
    if (!src)
      throw new Error('SkyBloomPass: sourceTexture must be set before init()');

    this.bw = Math.max(1, Math.floor(canvas.width * BLOOM_SCALE));
    this.bh = Math.max(1, Math.floor(canvas.height * BLOOM_SCALE));
    const { bw, bh } = this;

    // --- Gaussian bloom pipeline (passes 1 & 2) ---
    const bloomModule = device.createShaderModule({ code: bloomShader });

    this.pipeline = device.createRenderPipeline({
      label: 'sky bloom pipeline',
      layout: 'auto',
      vertex: { entryPoint: 'vs', module: bloomModule },
      fragment: {
        entryPoint: 'fs',
        module: bloomModule,
        targets: [{ format: 'rgba16float' }],
      },
    });

    const sampler = renderer.samplerManager.get('linear-clamped');

    this.extractTarget = device.createTexture({
      size: [bw, bh, 1],
      label: 'sky bloom H-pass intermediate',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.vPassTarget = device.createTexture({
      size: [bw, bh, 1],
      label: 'sky bloom V-pass intermediate',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const makeUniforms = (label: string) =>
      device.createBuffer({
        label,
        size: ALIGNED_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

    this.hUniforms = makeUniforms('sky bloom H uniforms');
    this.vUniforms = makeUniforms('sky bloom V uniforms');

    this.hBindGroup = device.createBindGroup({
      label: 'sky bloom H bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: src.createView() },
        { binding: 2, resource: { buffer: this.hUniforms } },
      ],
    });

    this.vBindGroup = device.createBindGroup({
      label: 'sky bloom V bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: this.extractTarget.createView() },
        { binding: 2, resource: { buffer: this.vUniforms } },
      ],
    });

    // --- Temporal stabilization pipeline (pass 3) ---
    const temporalModule = device.createShaderModule({ code: temporalShader });

    this.temporalPipeline = device.createRenderPipeline({
      label: 'sky bloom temporal pipeline',
      layout: 'auto',
      vertex: { entryPoint: 'vs', module: temporalModule },
      fragment: {
        entryPoint: 'fs',
        module: temporalModule,
        targets: [{ format: 'rgba16float' }],
      },
    });

    // renderTarget: the stabilized bloom that composite reads.
    // Needs COPY_SRC so we can copy it into historyTexture after each frame.
    this.renderTarget = device.createTexture({
      size: [bw, bh, 1],
      label: 'sky bloom stabilized highlights',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    // historyTexture: previous frame's stabilized bloom (starts as black).
    // Needs COPY_DST so renderTarget can be copied into it each frame.
    this.historyTexture = device.createTexture({
      size: [bw, bh, 1],
      label: 'sky bloom history',
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.temporalUniforms = device.createBuffer({
      label: 'sky bloom temporal uniforms',
      size: TEMPORAL_ALIGNED_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.temporalBindGroup = device.createBindGroup({
      label: 'sky bloom temporal bind group',
      layout: this.temporalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: this.vPassTarget.createView() },
        { binding: 2, resource: this.historyTexture.createView() },
        { binding: 3, resource: { buffer: this.temporalUniforms } },
      ],
    });

    return this;
  }

  dispose(): void {
    this.renderTarget?.destroy();
    this.extractTarget?.destroy();
    this.vPassTarget?.destroy();
    this.historyTexture?.destroy();
    this.hUniforms?.destroy();
    this.vUniforms?.destroy();
    this.temporalUniforms?.destroy();
    this.renderTarget = null as any;
    this.extractTarget = null as any;
    this.vPassTarget = null as any;
    this.historyTexture = null as any;
    this.hUniforms = null as any;
    this.vUniforms = null as any;
    this.temporalUniforms = null as any;
  }

  render(renderer: Renderer, timestampWrites?: GPURenderPassTimestampWrites) {
    const { device } = renderer;
    const { bw, bh } = this;
    const t = renderer.totalDeltaTime;

    // Write all uniform buffers before opening the command encoder.
    const hData = new Float32Array(ALIGNED_SIZE / 4);
    hData.set([bw, bh, t, this.bloomAmount, this.bloomThreshold, 1.0]);
    device.queue.writeBuffer(this.hUniforms, 0, hData.buffer);

    const vData = new Float32Array(ALIGNED_SIZE / 4);
    vData.set([bw, bh, t, this.bloomAmount, this.bloomThreshold, 0.0]);
    device.queue.writeBuffer(this.vUniforms, 0, vData.buffer);

    const temporalData = new Float32Array(TEMPORAL_ALIGNED_SIZE / 4);
    temporalData[0] = this.temporalBlend;
    device.queue.writeBuffer(this.temporalUniforms, 0, temporalData.buffer);

    const encoder = device.createCommandEncoder();

    // Pass 1: threshold extraction + horizontal Gaussian blur.
    const hPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.extractTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    hPass.setPipeline(this.pipeline);
    hPass.setBindGroup(0, this.hBindGroup);
    hPass.draw(6);
    hPass.end();

    // Pass 2: vertical Gaussian blur → vPassTarget.
    const vPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.vPassTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    vPass.setPipeline(this.pipeline);
    vPass.setBindGroup(0, this.vBindGroup);
    vPass.draw(6);
    vPass.end();

    // Pass 3: temporal blend(vPassTarget, historyTexture) → renderTarget.
    // timestampWrites covers this pass for GPU cost profiling.
    const temporalPass = encoder.beginRenderPass({
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
    temporalPass.setPipeline(this.temporalPipeline);
    temporalPass.setBindGroup(0, this.temporalBindGroup);
    temporalPass.draw(6);
    temporalPass.end();

    // Copy stable bloom → history for next frame.
    encoder.copyTextureToTexture(
      { texture: this.renderTarget },
      { texture: this.historyTexture },
      [bw, bh, 1]
    );

    device.queue.submit([encoder.finish()]);
  }
}
