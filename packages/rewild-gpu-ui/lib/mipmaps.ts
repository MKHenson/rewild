import shader from './shaders/mipmap.wgsl';

/** Makes the mip levels of 2D textures and texture arrays on the GPU. */
export class MipmapGenerator {
  private pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private sampler: GPUSampler;
  private module: GPUShaderModule;

  constructor(private device: GPUDevice) {
    this.sampler = device.createSampler({
      label: 'ui-mipmap',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.module = device.createShaderModule({
      label: 'ui-mipmap',
      code: shader,
    });
  }

  /**
   * Makes levels 1 and up of one layer from level 0. The texture needs
   * `TEXTURE_BINDING` and `RENDER_ATTACHMENT`.
   */
  generate(encoder: GPUCommandEncoder, texture: GPUTexture, layer = 0): void {
    const pipeline = this.pipeline(texture.format);
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const view = (mip: number) =>
        texture.createView({
          dimension: '2d',
          baseMipLevel: mip,
          mipLevelCount: 1,
          baseArrayLayer: layer,
          arrayLayerCount: 1,
        });
      const bindGroup = this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: view(level - 1) },
          { binding: 1, resource: this.sampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: 'ui mipmap',
        colorAttachments: [
          { view: view(level), loadOp: 'clear', storeOp: 'store' },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
  }

  private pipeline(format: GPUTextureFormat): GPURenderPipeline {
    let pipeline = this.pipelines.get(format);
    if (pipeline) return pipeline;
    pipeline = this.device.createRenderPipeline({
      label: `ui-mipmap-${format}`,
      layout: 'auto',
      vertex: { module: this.module, entryPoint: 'vs' },
      fragment: {
        module: this.module,
        entryPoint: 'fs',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.pipelines.set(format, pipeline);
    return pipeline;
  }
}

/** The number of mip levels down to 1 by 1. */
export function fullMipLevels(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height, 1))) + 1;
}
