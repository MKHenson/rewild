import { IPostProcess } from '../../types/IPostProcess';
import { Renderer } from '../Renderer';
import shader from '../shaders/atmosphereFinal.wgsl';
import { samplerManager } from '../textures/SamplerManager';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';
import constantsFn from '../shaders/atmosphere/constants.wgsl';
import commonShaderFns from '../shaders/atmosphere/fog.wgsl';
import { PostProcessManager } from './PostProcessManager';
import { Camera } from '../core/Camera';
import { degToRad, Matrix4, Vector3 } from 'rewild-common';

const finalUniformBufferSize =
  64 + // invProjectionMatrix
  8 + // resolutionXY
  4 + // iTime
  4 + // cloudiness
  16 + // sunPosition
  16 + // cameraPosition
  4 + // padding
  4 + // foginess
  0;

const alignedUniformBufferSize = Math.ceil(finalUniformBufferSize / 256) * 256;
const tempVec = new Vector3();
const uniformData = new Float32Array(alignedUniformBufferSize / 4);
const invViewProjectionMatrix = new Matrix4();

export class FinalCompPostProcess implements IPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  manager: PostProcessManager;
  scaleFactor: number;
  atmosphereTexture: GPUTexture | null;
  cloudsTexture: GPUTexture | null;

  cloudiness: number;
  elevation: number;
  azimuth: number;

  constructor() {
    this.scaleFactor = 1;
    this.atmosphereTexture = null;
    this.cloudsTexture = null;
  }

  init(renderer: Renderer): IPostProcess {
    const { device, canvas, presentationFormat } = renderer;
    const scaleFactor = this.scaleFactor;

    const module = device.createShaderModule({
      code: constantsFn + commonShaderFns + shader,
    });

    const vertexScreenQuadModule = device.createShaderModule({
      code: vertexScreenQuadShader,
    });

    this.renderTarget = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'final comp render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'atmosphere final pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: vertexScreenQuadModule,
      },
      fragment: {
        entryPoint: 'fs',
        module: module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
              },
            },
          },
        ],
      },
    });

    this.uniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere final pass',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'bind group for atmosphere final pass',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.atmosphereTexture!.createView() },
        { binding: 1, resource: this.cloudsTexture!.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
        { binding: 3, resource: samplerManager.get('linear-clamped') },
        {
          binding: 4,
          resource: renderer.depthTexture.createView(),
        },
      ],
    });

    return this;
  }

  private setupFinalPassUniforms(renderer: Renderer, camera: Camera) {
    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);
    const sunPosition = tempVec.setFromSphericalCoords(1, phi, theta);

    const canvas = renderer.canvas;

    invViewProjectionMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();

    uniformData.set(invViewProjectionMatrix.elements, 0); // modelMatrix
    uniformData.set(camera.transform.matrixWorld.elements, 16); // modelMatrix

    uniformData.set(
      [
        canvas.width,
        canvas.height,
        renderer.totalDeltaTime,
        this.cloudiness,
        sunPosition.x,
        sunPosition.y,
        sunPosition.z,
        0, // padding0
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
        0, //
        renderer.atmosphere.skyRenderer.foginess,
      ],
      32
    );
    return uniformData;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    const { device } = renderer;

    const uniformData = this.setupFinalPassUniforms(renderer, camera);
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
  }
}
