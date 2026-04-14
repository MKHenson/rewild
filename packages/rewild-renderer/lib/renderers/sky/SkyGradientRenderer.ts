import { Renderer } from '../../Renderer';
import commonShaderFns from '../../shaders/sky/skyCommon.wgsl';
import constantsFns from '../../shaders/sky/skyConstants.wgsl';
import fogFns from '../../shaders/sky/fog.wgsl';
import shader from '../../shaders/sky/skyGradient.wgsl';

export class SkyGradientRenderer {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;

  constructor() {}

  init(
    renderer: Renderer,
    uniformBuffer: GPUBuffer,
    nightSkyCubemap: GPUTexture
  ) {
    const { device, canvas } = renderer;

    const module = device.createShaderModule({
      code: shader + constantsFns + fogFns + commonShaderFns,
    });

    this.renderTarget = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      label: 'atmosphere render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Atmosphere & Night Pipeline',
      layout: 'auto',
      vertex: {
        module: module,
        entryPoint: 'vs',
      },
      fragment: {
        module: module,
        targets: [
          {
            format: 'rgba8unorm',
          },
        ],
        entryPoint: 'fs',
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for atmosphere & nightsky',
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
          binding: 3,
          resource: renderer.depthTexture.createView(),
        },
        {
          binding: 4,
          resource: renderer.samplerManager.get('depth-comparison'),
        },
        {
          binding: 5,
          resource: nightSkyCubemap.createView({ dimension: 'cube' }),
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
