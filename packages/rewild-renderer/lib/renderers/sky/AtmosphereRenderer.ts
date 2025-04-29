import { Renderer } from '../../Renderer';
import commonShaderFns from '../../shaders/atmosphere/common.wgsl';
import shader from '../../shaders/atmosphere/atmosphere.wgsl';
import { samplerManager } from '../../textures/SamplerManager';
import { textureManager } from '../../textures/TextureManager';
import { Geometry } from '../../geometry/Geometry';

export class AtmosphereRenderer {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;

  constructor() {}

  init(renderer: Renderer, uniformBuffer: GPUBuffer) {
    const { device, pane } = renderer;
    const canvas = pane.canvas()!;

    const module = device.createShaderModule({
      code: shader + commonShaderFns,
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
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
            ],
          },
          {
            arrayStride: 4 * 2,
            attributes: [
              {
                // uv
                shaderLocation: 1,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
        ],
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
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: 'cw',
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
          resource: samplerManager.get('linear'),
        },
        {
          binding: 2,
          resource: textureManager
            .get('rgba-noise-256')
            .gpuTexture.createView(),
        },
        {
          binding: 3,
          resource: renderer.depthTexture.createView(),
        },
        {
          binding: 4,
          resource: samplerManager.get('depth-comparison'),
        },
      ],
    });
  }

  render(encoder: GPUCommandEncoder, geometry: Geometry) {
    const cloudPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    cloudPass.setPipeline(this.pipeline);
    cloudPass.setVertexBuffer(0, geometry!.vertexBuffer);
    cloudPass.setVertexBuffer(1, geometry!.uvBuffer);
    cloudPass.setIndexBuffer(geometry!.indexBuffer, 'uint16');
    cloudPass.setBindGroup(0, this.bindGroup);
    cloudPass.drawIndexed(geometry!.indices!.length);
    cloudPass.end();
  }
}
