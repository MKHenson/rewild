import { Vector3 } from 'rewild-common';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Renderer } from '../Renderer';
import shader from '../shaders/atmosphereCloudsPass.wgsl';
import { samplerManager } from '../textures/SamplerManager';
import { textureManager } from '../textures/TextureManager';
import { Geometry } from '../geometry/Geometry';

const uniformBufferSize =
  16 * 4 + // modelMatrix
  16 * 4 + // projectionMatrix
  16 * 4 + // modelViewMatrix
  4 * 4 + // cameraPosition
  4 * 4 + // sunPosition
  4 * 4 + // up
  4 + // iTime
  4 + // resolutionX
  4 + // resolutionY
  4; // cloudiness

// Align the buffer size to the next multiple of 256
const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 256) * 256;

export class CloudsRenderer {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  cloudiness: number;
  sunPosition: Vector3;
  uniformData: Float32Array;

  constructor(sunPosition: Vector3) {
    this.cloudiness = 0.5;
    this.sunPosition = sunPosition;
    this.uniformData = new Float32Array(alignedUniformBufferSize / 4);
  }

  init(renderer: Renderer) {
    const { device, pane } = renderer;
    const canvas = pane.canvas()!;
    const scaleFactor = 0.6;

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere cube',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({
      code: shader,
    });

    this.renderTarget = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
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
          resource: { buffer: this.uniformBuffer },
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
          resource: textureManager.get('pebbles-512').gpuTexture.createView(),
        },
        {
          binding: 4,
          resource: renderer.depthTexture.createView(),
        },
        {
          binding: 5,
          resource: samplerManager.get('depth-comparison'),
        },
      ],
    });
  }

  update(
    renderer: Renderer,
    camera: Camera,
    width: number,
    height: number,
    meshes?: Mesh[]
  ) {
    const cloudiness = this.cloudiness;
    const sunPosition = this.sunPosition;
    const uniformData = this.uniformData;

    uniformData.set(meshes![0].transform.matrixWorld.elements, 0); // modelMatrix
    uniformData.set(camera.projectionMatrix.elements, 16); // projectionMatrix
    uniformData.set(meshes![0].transform.modelViewMatrix.elements, 32); // modelViewMatrix
    uniformData.set(
      [
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
      ],
      48
    ); // cameraPosition
    uniformData.set([sunPosition.x, sunPosition.y, sunPosition.z], 52); // sunPosition
    uniformData.set([0, 1, 0], 56); // up
    uniformData.set(
      [renderer.totalDeltaTime * 0.3, width, height, cloudiness],
      60
    );

    return uniformData;
  }

  render(
    renderer: Renderer,
    camera: Camera,
    meshes?: Mesh[],
    geometry?: Geometry
  ) {
    const { device } = renderer;
    const commandEncoder = device.createCommandEncoder();
    const cloudPass = commandEncoder.beginRenderPass({
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

    const uniformData = this.update(
      renderer,
      camera,
      this.renderTarget.width,
      this.renderTarget.height,
      meshes
    );

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    cloudPass.setBindGroup(0, this.bindGroup);
    cloudPass.drawIndexed(geometry!.indices!.length);
    cloudPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }
}
