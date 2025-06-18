import { Renderer } from '../../Renderer';
import commonShaderFns from '../../shaders/atmosphere/common.wgsl';
import constantsFns from '../../shaders/atmosphere/constants.wgsl';
import fogFns from '../../shaders/atmosphere/fog.wgsl';
import shader from '../../shaders/atmosphere/clouds.wgsl';
import { Geometry } from '../../geometry/Geometry';

export class CloudsRenderer {
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
      code: shader + constantsFns + fogFns + commonShaderFns,
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
        module,
        targets: [
          {
            format: 'rgba16float',
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

  dispose() {
    this.renderTarget.destroy();
  }
}
