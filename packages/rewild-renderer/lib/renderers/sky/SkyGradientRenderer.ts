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
      format: 'rgba16float',
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
            format: 'rgba16float',
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
        // Bindings 3/4 (depth texture + comparison sampler) are gone: the sky is
        // evaluated full-screen now, so this pass no longer reads the z-buffer.
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
