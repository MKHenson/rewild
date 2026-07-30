import mipmapShader from '../shaders/mipmap-generator.wgsl';

export class MipMapGenerator {
  module: GPUShaderModule;
  pipelineByFormat: Partial<{ [key in GPUTextureFormat]: GPURenderPipeline }>;
  sampler: GPUSampler;

  constructor() {
    this.pipelineByFormat = {};
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
  generateMips(device: GPUDevice, texture: GPUTexture, baseArrayLayer = 0) {
    const pipelines = this.pipelineByFormat;

    if (!this.module) {
      this.module = device.createShaderModule({
        label: 'textured quad shaders for mip level generation',
        code: mipmapShader,
      });

      this.sampler = device.createSampler({
        minFilter: 'linear',
      });
    }

    if (!pipelines[texture.format]) {
      pipelines[texture.format] = device.createRenderPipeline({
        label: 'mip level generator pipeline',
        layout: 'auto',
        vertex: {
          module: this.module,
          entryPoint: 'vs',
        },
        fragment: {
          module: this.module,
          entryPoint: 'fs',
          targets: [{ format: texture.format }],
        },
      });
    }

    const pipeline = pipelines[texture.format]!;

    const encoder = device.createCommandEncoder({
      label: 'mip gen encoder',
    });

    let width = texture.width;
    let height = texture.height;
    let baseMipLevel = 0;

    while (width > 1 || height > 1) {
      width = Math.max(1, (width / 2) | 0);
      height = Math.max(1, (height / 2) | 0);

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          {
            binding: 1,
            resource: texture.createView({
              dimension: '2d',
              baseMipLevel,
              mipLevelCount: 1,
              baseArrayLayer,
              arrayLayerCount: 1,
            }),
          },
        ],
      });

      ++baseMipLevel;

      const renderPassDescriptor: GPURenderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
          {
            view: texture.createView({
              dimension: '2d',
              baseMipLevel,
              mipLevelCount: 1,
              baseArrayLayer,
              arrayLayerCount: 1,
            }),
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

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }
}
