import { IRenderable } from '../../types/interfaces';
import { Geometry } from '../geometry/Geometry';
import { Renderer } from '../Renderer';
import shader from '../shaders/cube.wgsl';
import {
  createTextureFromSource,
  loadImageBitmap,
} from '../utils/ImageLoaders';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Camera } from '../core/Camera';
import { Transform } from '../core/Transform';
import { EulerRotationOrder } from 'rewild-common';

export class CubeRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  // verticesBuffer: GPUBuffer;
  cube: Geometry;
  cubeTransform: Transform;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    this.cubeTransform = new Transform();
    const module = device.createShaderModule({
      code: shader,
    });

    renderer.scene.addChild(this.cubeTransform);

    this.cube = BoxGeometryFactory.new(1, 1, 1, 1, 1, 1);
    this.cube.build(device);

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
      label: 'cube render pipeline',
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

    const uniformBufferSize = 4 * 16 * 2; // 4x4 matrix (x2)
    this.uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'cube bind group',
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

  update(renderer: Renderer): void {
    const now = Date.now() / 1000;

    const camera = renderer.perspectiveCam.camera;

    // Rotate the camera around the origin over time
    camera.transform.position.set(Math.sin(now) * 10, 0, Math.cos(now) * 10);
    camera.lookAt(0, 0, 0);

    this.cubeTransform.position.set(0, 0, 0);
    this.cubeTransform.rotation.set(
      -Math.sin(now * 2),
      Math.cos(now * 2),
      0,
      EulerRotationOrder.XYZ
    );
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    const { device } = renderer;

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      camera.projectionMatrix.elements.buffer,
      camera.projectionMatrix.elements.byteOffset,
      camera.projectionMatrix.elements.byteLength
    );

    device.queue.writeBuffer(
      this.uniformBuffer,
      4 * 16,
      this.cubeTransform.modelViewMatrix.elements.buffer,
      this.cubeTransform.modelViewMatrix.elements.byteOffset,
      this.cubeTransform.modelViewMatrix.elements.byteLength
    );

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.cube.vertexBuffer);
    pass.setVertexBuffer(1, this.cube.uvBuffer);
    pass.setIndexBuffer(this.cube.indexBuffer, 'uint16');
    pass.drawIndexed(this.cube.indices!.length);
  }
}
