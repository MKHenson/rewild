import { IRenderable } from '../../types/interfaces';
import { Geometry } from '../geometry/Geometry';
import { Renderer } from '../Renderer';
import shader from '../shaders/cube.wgsl';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Camera } from '../core/Camera';
import { Transform } from '../core/Transform';
import { EulerRotationOrder } from 'rewild-common';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';

export class CubesRenderer implements IRenderable {
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformValues: Float32Array;
  cube: Geometry;
  cube1Transform: Transform;
  cube2Transform: Transform;
  cube3Transform: Transform;

  transforms: Float32Array;
  instanceBuffer: GPUBuffer;

  async initialize(renderer: Renderer) {
    const { device, presentationFormat } = renderer;

    this.cube1Transform = new Transform();
    this.cube2Transform = new Transform();
    this.cube3Transform = new Transform();
    const module = device.createShaderModule({
      code: shader,
    });

    renderer.scene.addChild(this.cube1Transform);
    this.cube1Transform.addChild(this.cube2Transform);
    this.cube2Transform.position.set(0, 0, 1);
    this.cube2Transform.scale.set(0.5, 0.5, 0.5);

    this.cube2Transform.addChild(this.cube3Transform);
    this.cube3Transform.position.set(0, 0, 1);
    this.cube3Transform.scale.set(0.2, 0.2, 0.2);

    this.cube = BoxGeometryFactory.new(1, 1, 1, 1, 1, 1);
    this.cube.build(device);

    this.texture = textureManager.get('f-texture').gpuTexture;
    const sampler = samplerManager.get('linear');

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

    const uniformBufferSize = 4 * 16 * 1; // 4x4 matrix (x1)
    this.uniformBuffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Fill the transforms with the identity matrix
    // Set a section of the buffer to the identity matrix
    this.transforms = new Float32Array(16 * 3);
    this.transforms.set(this.cube1Transform.modelViewMatrix.elements, 0);
    this.transforms.set(this.cube2Transform.modelViewMatrix.elements, 16);

    this.instanceBuffer = device.createBuffer({
      label: 'element buffer',
      size: this.transforms.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.instanceBuffer, 0, this.transforms);

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
        {
          binding: 3,
          resource: {
            buffer: this.instanceBuffer,
          },
        },
      ],
    });

    this.pipeline = pipeline;
    return this;
  }

  update(renderer: Renderer, deltaTime: number, totalDeltaTime: number): void {
    this.cube1Transform.position.set(0, 0, 0);
    this.cube1Transform.rotation.set(
      -Math.sin(totalDeltaTime * 0.001 * 2),
      Math.cos(totalDeltaTime * 0.001 * 2),
      0,
      EulerRotationOrder.XYZ
    );

    this.cube2Transform.rotation.set(
      totalDeltaTime * 0.003,
      0,
      0,
      EulerRotationOrder.XYZ
    );

    this.cube3Transform.rotation.set(
      0,
      0,
      totalDeltaTime * 0.005,
      EulerRotationOrder.XYZ
    );
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    const { device } = renderer;

    this.transforms.set(this.cube1Transform.modelViewMatrix.elements, 0);
    this.transforms.set(this.cube2Transform.modelViewMatrix.elements, 16);
    this.transforms.set(this.cube3Transform.modelViewMatrix.elements, 32);
    device.queue.writeBuffer(this.instanceBuffer, 0, this.transforms);

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      camera.projectionMatrix.elements.buffer,
      camera.projectionMatrix.elements.byteOffset,
      camera.projectionMatrix.elements.byteLength
    );

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.cube.vertexBuffer);
    pass.setVertexBuffer(1, this.cube.uvBuffer);
    pass.setIndexBuffer(this.cube.indexBuffer, 'uint16');
    pass.drawIndexed(this.cube.indices!.length, 3);
  }
}
