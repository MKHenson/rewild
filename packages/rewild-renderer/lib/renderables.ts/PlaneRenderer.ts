import { mat4, vec3 } from 'wgpu-matrix';
import { IRenderable } from '../../types/interfaces';
import { Geometry } from '../geometry/Geometry';
import { Renderer } from '../Renderer';
import shader from '../shaders/plane.wgsl';
import {
  createTextureFromSource,
  loadImageBitmap,
} from '../utils/ImageLoaders';
import { PlaneGeometryFactory } from '../geometry/PlaneGeometryFactory';

export class PlaneRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  // verticesBuffer: GPUBuffer;
  plane: Geometry;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: shader,
    });

    this.plane = PlaneGeometryFactory.new(0.5, 0.5, 1, 1);
    this.plane.build(device);

    // Create a texture from the image.
    const MEDIA_URL = process.env.MEDIA_URL;
    const url = `${MEDIA_URL}utils/f-texture.png`;
    const source = await loadImageBitmap(url);
    this.texture = createTextureFromSource(device, source, 'rgba8unorm', false);

    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
    });

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
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    const uniformBufferSize = 4 * 16; // 4x4 matrix
    this.uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'plane bind group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer,
          },
        },
        {
          binding: 1,
          resource: sampler,
        },
        {
          binding: 2,
          resource: this.texture.createView(),
        },
      ],
    });

    this.pipeline = pipeline;
    return this;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder) {
    const { device, pane } = renderer;
    const canvas = pane.canvas()!;
    const aspect = canvas.width / canvas.height;
    const projectionMatrix: Float32Array = mat4.perspective(
      (2 * Math.PI) / 5,
      aspect,
      1,
      100.0
    );
    const modelViewProjectionMatrix: Float32Array = mat4.create();

    const transformationMatrix = getTransformationMatrix(
      projectionMatrix,
      modelViewProjectionMatrix
    );

    mat4.identity(transformationMatrix);

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      transformationMatrix.buffer,
      transformationMatrix.byteOffset,
      transformationMatrix.byteLength
    );

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.plane.vertexBuffer);
    pass.setVertexBuffer(1, this.plane.uvBuffer);
    pass.setIndexBuffer(this.plane.indexBuffer, 'uint16');
    pass.drawIndexed(this.plane.indices!.length);
  }
}

function getTransformationMatrix(
  projectionMatrix: Float32Array,
  modelViewProjectionMatrix: Float32Array
) {
  const viewMatrix = mat4.identity();
  mat4.translate(viewMatrix, vec3.fromValues(0, 0, -20), viewMatrix);
  const now = Date.now() / 1000;
  mat4.rotate(
    viewMatrix,
    vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    1,
    viewMatrix
  );

  mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
  return modelViewProjectionMatrix;
}
