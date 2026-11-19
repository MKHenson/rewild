import mipmapShader from '../shaders/mipmap-generator.wgsl';

/** Which fragment entry point a pipeline runs. See mipmap-generator.wgsl. */
type MipPass = 'plain' | 'coverage' | 'fill';

const ENTRY_POINTS: Record<MipPass, string> = {
  plain: 'fs',
  coverage: 'fsCoverage',
  fill: 'fsFill',
};

const SINGLE_LAYER = { dimension: '2d', mipLevelCount: 1, arrayLayerCount: 1 };

export class MipMapGenerator {
  module: GPUShaderModule | null;
  sampler: GPUSampler | null;
  private pipelines = new Map<string, GPURenderPipeline>();
  private device: GPUDevice | null;

  constructor() {
    this.module = null;
    this.sampler = null;
    this.device = null;
  }

  /**
   * Fills mip levels 1..n of `texture` by successively half-scaling the level
   * above, for the single array layer `baseArrayLayer` (0 for a plain 2D
   * texture). Array textures need one call per layer.
   *
   * Every view is created with an explicit `dimension: '2d'` and a single
   * layer: WebGPU defaults a layered texture's view to `2d-array`, which will
   * not bind to the `texture_2d<f32>` this generator's shader declares. That
   * default is why layered textures previously shipped without mips.
   *
   * Averaging happens in linear space for free, and only because the source
   * and destination views share the texture's own format: for an `-srgb`
   * texture the sampler decodes before the hardware blends the four texels,
   * and the colour attachment re-encodes on write. Nothing here needs to know
   * which space it is in — but a caller that reformatted either view (via
   * `viewFormats`) to strip the `-srgb` suffix would silently be back to
   * averaging the encoding.
   */
  generateMips(
    device: GPUDevice,
    texture: GPUTexture,
    baseArrayLayer = 0,
    timestamps?: GPURenderPassTimestampWrites
  ) {
    const encoder = device.createCommandEncoder({ label: 'mip gen encoder' });
    this.downsample(device, encoder, texture, baseArrayLayer, 'plain', timestamps);
    device.queue.submit([encoder.finish()]);
  }

  /**
   * Mips for a texture whose alpha is a cutout, such as foliage.
   *
   * The colour of a transparent texel is not defined by the image: an exporter
   * leaves it black, white or anything else, and a premultiplied decode turns
   * it black. Plain mips average it into every cutout edge, and so does the
   * bilinear filter at draw time, at every level. The edge then gains a dark or
   * pale fringe that grows with distance.
   *
   * So this pushes and then pulls. Down the chain, each level takes the colour
   * of the visible texels under it only. Back up the chain, each level's
   * transparent texels take the colour of the coarser level below, which by
   * then holds the nearby visible colour. Every transparent texel, level 0
   * included, ends up the colour of the cutout beside it, and its alpha is
   * left as it was.
   */
  generateCoverageMips(device: GPUDevice, texture: GPUTexture) {
    const encoder = device.createCommandEncoder({
      label: 'coverage mip gen encoder',
    });
    const levels = this.downsample(device, encoder, texture, 0, 'coverage');

    const pipeline = this.pipeline(device, texture.format, 'fill');
    for (let level = levels - 1; level >= 0; level--) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler! },
          {
            binding: 1,
            resource: texture.createView({
              ...SINGLE_LAYER,
              baseMipLevel: level + 1,
            } as GPUTextureViewDescriptor),
          },
        ],
      });

      const pass = encoder.beginRenderPass({
        label: 'coverage mip fill',
        colorAttachments: [
          {
            view: texture.createView({
              ...SINGLE_LAYER,
              baseMipLevel: level,
            } as GPUTextureViewDescriptor),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  /** Encodes levels 1..n from the level above each. Returns how many levels it
   *  wrote. */
  private downsample(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    texture: GPUTexture,
    baseArrayLayer: number,
    kind: 'plain' | 'coverage',
    timestamps?: GPURenderPassTimestampWrites
  ): number {
    const pipeline = this.pipeline(device, texture.format, kind);

    let width = texture.width;
    let height = texture.height;
    let baseMipLevel = 0;

    // `timestamps` (GpuPassTimer) spans the chain: its start on the first
    // level's pass, its end on the last's.
    let levels = 0;
    for (
      let w = width, h = height;
      (w > 1 || h > 1) && levels + 1 < texture.mipLevelCount;
      levels++
    ) {
      w = Math.max(1, (w / 2) | 0);
      h = Math.max(1, (h / 2) | 0);
    }
    const span = timestamps as unknown as
      | {
          querySet: GPUQuerySet;
          beginningOfPassWriteIndex: number;
          endOfPassWriteIndex: number;
        }
      | undefined;

    // Stops at the chain the texture was created with, which may be shorter
    // than a full one.
    while (
      (width > 1 || height > 1) &&
      baseMipLevel + 1 < texture.mipLevelCount
    ) {
      width = Math.max(1, (width / 2) | 0);
      height = Math.max(1, (height / 2) | 0);

      const source = texture.createView({
        ...SINGLE_LAYER,
        baseMipLevel,
        baseArrayLayer,
      } as GPUTextureViewDescriptor);
      // The coverage pass reads texels with textureLoad, so its 'auto' layout
      // has no sampler binding.
      const entries: GPUBindGroupEntry[] =
        kind === 'plain'
          ? [
              { binding: 0, resource: this.sampler! },
              { binding: 1, resource: source },
            ]
          : [{ binding: 1, resource: source }];
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries,
      });

      ++baseMipLevel;

      const first = baseMipLevel === 1;
      const last = baseMipLevel === levels;
      const renderPassDescriptor: GPURenderPassDescriptor = {
        label: 'our basic canvas renderPass',
        timestampWrites:
          span && (first || last)
            ? ({
                querySet: span.querySet,
                beginningOfPassWriteIndex: first
                  ? span.beginningOfPassWriteIndex
                  : undefined,
                endOfPassWriteIndex: last
                  ? span.endOfPassWriteIndex
                  : undefined,
              } as unknown as GPURenderPassTimestampWrites)
            : undefined,
        colorAttachments: [
          {
            view: texture.createView({
              ...SINGLE_LAYER,
              baseMipLevel,
              baseArrayLayer,
            } as GPUTextureViewDescriptor),
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };

      const pass = encoder.beginRenderPass(renderPassDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6); // call our vertex shader 6 times
      pass.end();
    }

    return levels;
  }

  private pipeline(
    device: GPUDevice,
    format: GPUTextureFormat,
    kind: MipPass
  ): GPURenderPipeline {
    // The module, sampler and pipelines all belong to the device that created
    // them, so a new device invalidates every cached object.
    if (this.device !== device) {
      this.device = device;
      this.module = null;
      this.sampler = null;
      this.pipelines.clear();
    }

    if (!this.module) {
      this.module = device.createShaderModule({
        label: 'textured quad shaders for mip level generation',
        code: mipmapShader,
      });

      this.sampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
      });
    }

    const key = `${format}:${kind}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline) return pipeline;

    // The fill writes colour only where this level is transparent:
    // src * (1 - dst alpha) + dst * dst alpha, with dst alpha kept.
    const blend: GPUBlendState | undefined =
      kind === 'fill'
        ? {
            color: {
              srcFactor: 'one-minus-dst-alpha',
              dstFactor: 'dst-alpha',
              operation: 'add',
            },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          }
        : undefined;

    pipeline = device.createRenderPipeline({
      label: `mip level generator pipeline (${kind})`,
      layout: 'auto',
      vertex: {
        module: this.module!,
        entryPoint: 'vs',
      },
      fragment: {
        module: this.module!,
        entryPoint: ENTRY_POINTS[kind],
        targets: [{ format, blend }],
      },
    });
    this.pipelines.set(key, pipeline);
    return pipeline;
  }
}
