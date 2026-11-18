import { blurSteps, GLASS_BLUR } from './glassStyle';
import shader from './shaders/backdrop.wgsl';

/** The image that glass blurs: what the UI draws over. */
export interface UIBackdropSource {
  /** Covers the UI's target. It can be smaller than the target, such as a scene drawn below the device pixel ratio. */
  texture: GPUTexture;
  /**
   * Set for an HDR source, such as the game's scene. The blur applies this
   * exposure and the game's ACES curve, so it has the colours on screen.
   * Leave it out for a source in display colours.
   */
  exposure?: number;
}

const FORMAT: GPUTextureFormat = 'rgba16float';
/** Uniform buffer offsets must be multiples of 256 bytes. */
const PARAMS_STRIDE = 256;

interface BlurPass {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  target: GPUTextureView;
}

/**
 * Blurs the image under the UI for glass. A prefilter makes a quarter size
 * image, then a dual Kawase blur spreads it as the DOM's `blur(18px)` does.
 */
export class UIBackdrop {
  /** The blurred image, a quarter of the source's size, or null before the first blur. */
  texture: GPUTexture | null = null;
  private levels: GPUTexture[] = [];
  private passes: BlurPass[] = [];
  private bindGroupLayout: GPUBindGroupLayout;
  private prefilter: GPURenderPipeline;
  private down: GPURenderPipeline;
  private up: GPURenderPipeline;
  private sampler: GPUSampler;
  private params: GPUBuffer | null = null;
  private paramData = new Float32Array(0);
  private builtFor: GPUTexture | null = null;
  private builtLevels = 0;

  constructor(private device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'ui-backdrop',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const layout = device.createPipelineLayout({
      label: 'ui-backdrop',
      bindGroupLayouts: [this.bindGroupLayout],
    });
    const module = device.createShaderModule({
      label: 'ui-backdrop',
      code: shader,
    });
    const pipeline = (entryPoint: string) =>
      device.createRenderPipeline({
        label: `ui-backdrop-${entryPoint}`,
        layout,
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint, targets: [{ format: FORMAT }] },
      });
    this.prefilter = pipeline('prefilter');
    this.down = pipeline('down');
    this.up = pipeline('up');
    this.sampler = device.createSampler({
      label: 'ui-backdrop',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  /**
   * Encodes the blur of `source`, which has `pixelRatio` pixels per CSS pixel.
   * `timestampWrites` brackets all the passes: the first pass writes its
   * begin and the last pass writes its end.
   */
  render(
    encoder: GPUCommandEncoder,
    source: UIBackdropSource,
    pixelRatio: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    const { levels, offset } = blurSteps(GLASS_BLUR * pixelRatio);
    if (source.texture !== this.builtFor || levels !== this.builtLevels)
      this.build(source.texture, levels);
    this.writeParams(source, offset);
    const last = this.passes.length - 1;
    for (let i = 0; i <= last; i++) {
      const pass = this.passes[i];
      const render = encoder.beginRenderPass({
        label: 'ui-backdrop',
        timestampWrites: timestampWrites && bracket(timestampWrites, i, last),
        colorAttachments: [
          { view: pass.target, loadOp: 'clear', storeOp: 'store' },
        ],
      });
      render.setPipeline(pass.pipeline);
      render.setBindGroup(0, pass.bindGroup);
      render.draw(3);
      render.end();
    }
  }

  dispose(): void {
    for (const level of this.levels) level.destroy();
    this.levels = [];
    this.passes = [];
    this.params?.destroy();
    this.params = null;
    this.texture = null;
    this.builtFor = null;
  }

  /**
   * Makes the levels and the passes: the prefilter into level 0, a pass down
   * into each smaller level, then a pass up into each larger one.
   */
  private build(source: GPUTexture, levels: number): void {
    this.dispose();
    let width = Math.max(1, Math.ceil(source.width / 4));
    let height = Math.max(1, Math.ceil(source.height / 4));
    for (let i = 0; i <= levels; i++) {
      this.levels.push(
        this.device.createTexture({
          label: `ui-backdrop-${i}`,
          size: [width, height],
          format: FORMAT,
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        })
      );
      width = Math.max(1, Math.ceil(width / 2));
      height = Math.max(1, Math.ceil(height / 2));
    }
    const passCount = 2 * levels + 1;
    this.params = this.device.createBuffer({
      label: 'ui-backdrop-params',
      size: passCount * PARAMS_STRIDE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.paramData = new Float32Array((passCount * PARAMS_STRIDE) / 4);
    const add = (
      pipeline: GPURenderPipeline,
      from: GPUTexture,
      to: GPUTexture
    ) => {
      const slot = this.passes.length;
      this.passes.push({
        pipeline,
        target: to.createView(),
        bindGroup: this.device.createBindGroup({
          label: 'ui-backdrop',
          layout: this.bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.params!,
                offset: slot * PARAMS_STRIDE,
                size: 16,
              },
            },
            { binding: 1, resource: from.createView() },
            { binding: 2, resource: this.sampler },
          ],
        }),
      });
      // Each pass reads its source's texels.
      const o = (slot * PARAMS_STRIDE) / 4;
      this.paramData[o] = 1 / from.width;
      this.paramData[o + 1] = 1 / from.height;
    };
    add(this.prefilter, source, this.levels[0]);
    for (let i = 1; i <= levels; i++)
      add(this.down, this.levels[i - 1], this.levels[i]);
    for (let i = levels; i >= 1; i--)
      add(this.up, this.levels[i], this.levels[i - 1]);
    this.texture = this.levels[0];
    this.builtFor = source;
    this.builtLevels = levels;
  }

  private writeParams(source: UIBackdropSource, offset: number): void {
    const data = this.paramData;
    for (let slot = 0; slot < this.passes.length; slot++) {
      const o = (slot * PARAMS_STRIDE) / 4;
      // The prefilter's taps sit at fixed places. The tone map runs only there.
      data[o + 2] = slot === 0 ? 0 : offset;
      data[o + 3] = slot === 0 ? source.exposure ?? 0 : 0;
    }
    this.device.queue.writeBuffer(this.params!, 0, data);
  }
}

/** The part of `writes` that pass `index` of `0..last` writes. */
function bracket(
  writes: GPURenderPassTimestampWrites,
  index: number,
  last: number
): GPURenderPassTimestampWrites | undefined {
  if (index !== 0 && index !== last) return undefined;
  // The installed @webgpu/types describe an older form of this descriptor.
  // Browsers take the object form.
  const { querySet, beginningOfPassWriteIndex, endOfPassWriteIndex } =
    writes as unknown as {
      querySet: GPUQuerySet;
      beginningOfPassWriteIndex?: number;
      endOfPassWriteIndex?: number;
    };
  return {
    querySet,
    beginningOfPassWriteIndex:
      index === 0 ? beginningOfPassWriteIndex : undefined,
    endOfPassWriteIndex: index === last ? endOfPassWriteIndex : undefined,
  } as unknown as GPURenderPassTimestampWrites;
}
