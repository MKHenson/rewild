import { IRenderable } from '../../types/interfaces';
import { Geometry } from '../geometry/Geometry';
import { Renderer } from '../Renderer';
import shader from '../shaders/vbo.wgsl';
import { PlaneGeometryFactory } from '../geometry/PlaneGeometryFactory';

export class PlaneRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  pipeline: GPURenderPipeline;
  plane: Geometry;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: shader,
    });

    this.plane = PlaneGeometryFactory.new(2, 2, 1, 1);
    this.plane.build(device);

    const sampler = renderer.samplerManager.get('nearest-simple');
    const texture = renderer.textureManager.get('grid-data');
    this.texture = texture.gpuTexture;

    const pipeline = device.createRenderPipeline({
      label: 'plane render pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
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
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      multisample: {
        count: renderer.sampleCount,
      },
      primitive: {
        topology: 'triangle-list',

        // Backface culling since the cube is solid piece of geometry.
        // Faces pointing away from the camera will be occluded by faces
        // pointing toward the camera.
        cullMode: 'back',
        frontFace: 'ccw',
      },
      // Enable depth testing so that the fragment closest to the camera
      // is rendered in front.
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'always',
        format: 'depth24plus',
      },
    });

    this.bindGroup = device.createBindGroup({
      label: 'plane bind group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: sampler,
        },
        {
          binding: 1,
          resource: this.texture.createView(),
        },
      ],
    });

    this.pipeline = pipeline;
    return this;
  }

  update(): void {}

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.plane.vertexBuffer);
    pass.setVertexBuffer(1, this.plane.uvBuffer);
    pass.setIndexBuffer(this.plane.indexBuffer, 'uint32');
    pass.drawIndexed(this.plane.indices!.length);
  }
}
