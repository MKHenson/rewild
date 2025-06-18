import { IPostProcess } from '../../types/IPostProcess';
import { Renderer } from '../Renderer';
import bloomShader from '../shaders/atmosphereBloomPass.wgsl';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';
import { PostProcessManager } from './PostProcessManager';

const bloomPassUniformBufferSize =
  2 * 4 + // (resolutionX, resolutionY)
  4; // iTime

const alignedUniformBufferSize =
  Math.ceil(bloomPassUniformBufferSize / 256) * 256;

const uniformData = new Float32Array(alignedUniformBufferSize / 4);

export class BloomPostProcess implements IPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  manager: PostProcessManager;
  scaleFactor: number;
  sourceTexture: GPUTexture | null;

  constructor() {
    this.scaleFactor = 0.75;
    this.sourceTexture = null;
  }

  init(renderer: Renderer): IPostProcess {
    const { device, canvas } = renderer;
    const scaleFactor = this.scaleFactor;

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

    const module = device.createShaderModule({
      code: bloomShader,
    });

    const vertexScreenQuadModule = device.createShaderModule({
      code: vertexScreenQuadShader,
    });

    this.renderTarget = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'bloom render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'atmosphere bloom pipeline',
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
          },
        ],
      },
    });

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere bloom pass',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for atmosphere bloom pass',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    return this;
  }

  dispose(): void {
    if (this.renderTarget) {
      this.renderTarget.destroy();
      this.renderTarget = null as any;
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null as any;
    }
  }

  render(renderer: Renderer) {
    const { device } = renderer;

    uniformData.set([
      this.renderTarget.width,
      this.renderTarget.height,
      renderer.totalDeltaTime,
    ]);

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    const commandEncoder = device.createCommandEncoder();
    const bloomPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    bloomPass.setPipeline(this.pipeline);
    bloomPass.setBindGroup(0, this.bindGroup);
    bloomPass.draw(6);
    bloomPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }
}
