import { IPostProcess } from '../../types/IPostProcess';
import { Renderer } from '../Renderer';
import taaShader from '../shaders/atmosphereTAAPass.wgsl';
import { samplerManager } from '../textures/SamplerManager';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';
import { PostProcessManager } from './PostProcessManager';

const bloomPassUniformBufferSize =
  2 * 4 + // (resolutionX, resolutionY)
  4; // iTime

const alignedUniformBufferSize =
  Math.ceil(bloomPassUniformBufferSize / 256) * 256;

const uniformData = new Float32Array(alignedUniformBufferSize / 4);

export class TAAPostProcess implements IPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  sourceTexture: GPUTexture | null;
  prevTaaTexture: GPUTexture;
  manager: PostProcessManager;
  private firstTAAPass: boolean;

  constructor() {
    this.sourceTexture = null;
    this.firstTAAPass = true;
  }

  init(renderer: Renderer): IPostProcess {
    const { device } = renderer;

    const module = device.createShaderModule({
      code: taaShader,
    });

    const vertexScreenQuadModule = device.createShaderModule({
      code: vertexScreenQuadShader,
    });

    // Try to get the previous post process
    let texture = this.sourceTexture;
    if (!texture) {
      const indexOfThisPostProcess = this.manager.postProcesses.indexOf(this);
      const prevPostProcess = this.manager.getPostProcessAt(
        indexOfThisPostProcess - 1
      );
      texture = prevPostProcess?.renderTarget || null;
      if (!texture) throw new Error('Previous post process not found');
    }

    this.renderTarget = device.createTexture({
      size: [texture.width, texture.height, 1],
      label: 'taa render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    this.prevTaaTexture = device.createTexture({
      size: [texture.width, texture.height, 1],
      label: 'prev taa render target',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'TAA pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: vertexScreenQuadModule,
      },
      fragment: {
        entryPoint: 'fs',
        module: module,
        targets: [
          {
            format: 'rgba8unorm',
            // blend: {
            // color: {
            //   srcFactor: 'src-alpha',
            //   dstFactor: 'one-minus-src-alpha',
            // },
            // alpha: {
            //   srcFactor: 'src-alpha',
            //   dstFactor: 'one-minus-src-alpha',
            // },
            // },
          },
        ],
      },
    });

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for taa pass',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for atmosphere taa',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture!.createView() },
        { binding: 1, resource: this.prevTaaTexture.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
        { binding: 3, resource: samplerManager.get('linear-clamped') },
      ],
    });

    return this;
  }

  render(renderer: Renderer) {
    const { device } = renderer;

    // Copy the taaTexture to the prevTaaTexture for first pass
    if (this.firstTAAPass) {
      this.firstTAAPass = false;
      const copyEncoder = device.createCommandEncoder();
      copyEncoder.copyTextureToTexture(
        {
          texture: this.sourceTexture!,
        },
        {
          texture: this.prevTaaTexture,
        },
        [this.renderTarget.width, this.renderTarget.height, 1]
      );

      device.queue.submit([copyEncoder.finish()]);
    }

    const commandEncoder = device.createCommandEncoder();
    const taaPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [1.0, 1.0, 1.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    uniformData.set([
      this.renderTarget.width,
      this.renderTarget.height,
      renderer.totalDeltaTime,
    ]);

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    taaPass.setPipeline(this.pipeline);
    taaPass.setBindGroup(0, this.bindGroup);
    taaPass.draw(6);
    taaPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // Copy the renderTarget to the prevTaaTexture
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToTexture(
      {
        texture: this.renderTarget,
      },
      {
        texture: this.prevTaaTexture,
      },
      [this.renderTarget.width, this.renderTarget.height, 1]
    );

    device.queue.submit([copyEncoder.finish()]);
  }
}
