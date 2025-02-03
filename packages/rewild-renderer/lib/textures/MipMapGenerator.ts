import { samplerManager } from './SamplerManager';
import mipmapShader from '../shaders/mipmap-generator.wgsl';

class MipMapGenerator {
  module: GPUShaderModule;
  pipelineByFormat: Partial<{ [key in GPUTextureFormat]: GPURenderPipeline }>;
  sampler: GPUSampler;

  constructor() {
    this.pipelineByFormat = {};
  }

  generateMips(device: GPUDevice, texture: GPUTexture) {
    const pipelines = this.pipelineByFormat;

    if (!this.module) {
      this.module = device.createShaderModule({
        label: 'textured quad shaders for mip level generation',
        code: mipmapShader,
      });

      this.sampler = samplerManager.get('mip-generator');
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
            resource: texture.createView({ baseMipLevel, mipLevelCount: 1 }),
          },
        ],
      });

      ++baseMipLevel;

      const renderPassDescriptor: GPURenderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
          {
            view: texture.createView({ baseMipLevel, mipLevelCount: 1 }),
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

export const mipMapGenerator = new MipMapGenerator();
