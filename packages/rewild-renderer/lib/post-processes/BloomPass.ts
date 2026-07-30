import { IPostProcess } from '../../types/IPostProcess';
import { Renderer } from '../Renderer';
import bloomShader from '../shaders/frame-compositing/bloom.wgsl';
import temporalShader from '../shaders/frame-compositing/bloom-temporal.wgsl';
import { PostProcessManager } from './PostProcessManager';
import { RenderQuality } from '../utils/RenderQuality';
import { composeShader } from '../utils/shaderDefines';
import { bloomScale, bloomShaderDefines } from './BloomQuality';

const UNIFORM_FLOATS = 7; // resolution(2) + iTime + bloomAmount + bloomThreshold + horizontal + cloudsGated
const ALIGNED_SIZE = Math.ceil((UNIFORM_FLOATS * 4) / 256) * 256;

const TEMPORAL_ALIGNED_SIZE = Math.ceil((1 * 4) / 256) * 256; // blendFactor f32

/**
 * Three-pass bloom: horizontal extraction → vertical blur → temporal stabilization.
 *
 * Pass 1 reads the composited HDR frame — scene, sky, clouds and shafts —
 * extracts pixels above
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
export class BloomPass implements IPostProcess {
  /** Quality tier, read when init() builds the shader module. Assigned by
   *  SkyRenderer.init(); set `skyRenderer.quality` to change it. */
  quality: RenderQuality = 'high';

  renderTarget: GPUTexture; // temporally stabilised HDR bloom (consumed by composite)
  manager: PostProcessManager;
  sourceTexture: GPUTexture | null; // set to renderer.sceneColorTarget before init()

  /** Scales the HDR highlight added to clouds before tonemapping.
   *  Range 0–3; default 1.2. Higher = brighter glow. */
  bloomAmount: number = 0.86;

  /**
   * Threshold in exposure-adjusted luminance (EXPOSURE * raw_luminance, with
   * EXPOSURE = 0.001 in bloom.wgsl), so this value times 1000 is the raw HDR
   * luminance at which a pixel starts to bloom.
   *
   * skyBlend caps the sky at 60 HDR, i.e. 0.06 here, so the gate has to sit
   * above that or the entire sky is a bloom source — which is what 0.05 was
   * doing. At 0.10 the shoulder runs from 50 to 150 HDR: capped sky contributes
   * essentially nothing, sunlit cloud tops and the sun disc still bloom fully.
   */
  bloomThreshold: number = 0.1;

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
      throw new Error('BloomPass: sourceTexture must be set before init()');

    const scale = bloomScale(this.quality);
    this.bw = Math.max(1, Math.floor(canvas.width * scale));
    this.bh = Math.max(1, Math.floor(canvas.height * scale));
    const { bw, bh } = this;

    // --- Gaussian bloom pipeline (passes 1 & 2) ---
    // Only the blur module takes defines; bloom-temporal.wgsl has no kernel.
    const bloomModule = device.createShaderModule({
      code: composeShader([bloomShader], bloomShaderDefines(this.quality)),
    });

    this.pipeline = device.createRenderPipeline({
      label: 'bloom pipeline',
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
      label: 'bloom H-pass intermediate',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.vPassTarget = device.createTexture({
      size: [bw, bh, 1],
      label: 'bloom V-pass intermediate',
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

    this.hUniforms = makeUniforms('bloom H uniforms');
    this.vUniforms = makeUniforms('bloom V uniforms');

    // Both passes share one pipeline, so both bind groups must supply the depth
    // texture even though only the H pass reads it (V gets coverage from alpha).
    const depthView = renderer.depthTexture.createView();

    this.hBindGroup = device.createBindGroup({
      label: 'bloom H bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: src.createView() },
        { binding: 2, resource: { buffer: this.hUniforms } },
        { binding: 3, resource: depthView },
      ],
    });

    this.vBindGroup = device.createBindGroup({
      label: 'bloom V bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: this.extractTarget.createView() },
        { binding: 2, resource: { buffer: this.vUniforms } },
        { binding: 3, resource: depthView },
      ],
    });

    // --- Temporal stabilization pipeline (pass 3) ---
    const temporalModule = device.createShaderModule({ code: temporalShader });

    this.temporalPipeline = device.createRenderPipeline({
      label: 'bloom temporal pipeline',
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
      label: 'bloom stabilized highlights',
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
      label: 'bloom history',
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.temporalUniforms = device.createBuffer({
      label: 'bloom temporal uniforms',
      size: TEMPORAL_ALIGNED_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.temporalBindGroup = device.createBindGroup({
      label: 'bloom temporal bind group',
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

    // Coverage weighting is off. It existed because bloom used to source the
    // sky+cloud blend, where the depth-gated cloud march leaves vec4f(0) on
    // terrain pixels — missing data a plain Gaussian would average in, producing
    // an under-bloomed band along every ridge. The source is now the fully
    // composited HDR frame, where those pixels hold real scene radiance, so
    // every texel is valid and the kernel is a straight Gaussian.
    const cloudsGated = 0.0;

    // Write all uniform buffers before opening the command encoder.
    const hData = new Float32Array(ALIGNED_SIZE / 4);
    hData.set([
      bw,
      bh,
      t,
      this.bloomAmount,
      this.bloomThreshold,
      1.0,
      cloudsGated,
    ]);
    device.queue.writeBuffer(this.hUniforms, 0, hData.buffer);

    // V pass reads coverage from the H output's alpha — no depth lookup needed.
    const vData = new Float32Array(ALIGNED_SIZE / 4);
    vData.set([bw, bh, t, this.bloomAmount, this.bloomThreshold, 0.0, 0.0]);
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
