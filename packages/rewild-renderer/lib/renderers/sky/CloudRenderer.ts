import { Renderer } from '../../Renderer';
import commonShaderFns from '../../shaders/sky/skyCommon.wgsl';
import constantsFns from '../../shaders/sky/skyConstants.wgsl';
import fogFns from '../../shaders/sky/fog.wgsl';
import cloudDensityFns from '../../shaders/sky/cloudDensity.wgsl';
import shader from '../../shaders/sky/clouds.wgsl';

export class CloudRenderer {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  resolutionScale: number;

  constructor() {
    this.resolutionScale = 0.8;
  }

  init(renderer: Renderer, uniformBuffer: GPUBuffer) {
    const { device, canvas } = renderer;
    const resolutionScale = this.resolutionScale;

    const module = device.createShaderModule({
      code: shader + constantsFns + fogFns + commonShaderFns + cloudDensityFns,
    });

    this.renderTarget = device.createTexture({
      size: [
        canvas.width * resolutionScale,
        canvas.height * resolutionScale,
        1,
      ],
      label: 'clouds render target',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Clouds Post Process Pass',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
      },
      fragment: {
        module,
        targets: [
          {
            format: 'rgba16float',
          },
        ],
        entryPoint: 'fs',
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for atmosphere clouds',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: renderer.samplerManager.get('linear'),
        },
        {
          binding: 2,
          resource: renderer.textureManager
            .get('rgba-noise-256')
            .gpuTexture.createView(),
        },
        {
          binding: 3,
          resource: renderer.textureManager
            .get('pebbles-512')
            .gpuTexture.createView(),
        },
        {
          binding: 4,
          resource: renderer.depthTexture.createView(),
        },
        {
          binding: 5,
          resource: renderer.samplerManager.get('depth-comparison'),
        },
      ],
    });
  }

  render(
    encoder: GPUCommandEncoder,
    timestampWrites?: GPURenderPassTimestampWrites
  ) {
    const cloudPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });

    cloudPass.setPipeline(this.pipeline);
    cloudPass.setBindGroup(0, this.bindGroup);
    cloudPass.draw(6);
    cloudPass.end();
  }

  dispose() {
    this.renderTarget.destroy();
  }
}
