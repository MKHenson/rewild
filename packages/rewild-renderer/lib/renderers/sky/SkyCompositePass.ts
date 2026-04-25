import { IPostProcess } from '../../../types/IPostProcess';
import { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/skyComposite.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';
import constantsFn from '../../shaders/sky/skyConstants.wgsl';
import commonShaderFns from '../../shaders/sky/fog.wgsl';
import { PostProcessManager } from '../../post-processes/PostProcessManager';
import { Camera } from '../../core/Camera';
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
  4 + // shadowWorldSize
  4 + // shadowIntensity
  4 + // lightningFlash
  0;

const alignedUniformBufferSize = Math.ceil(finalUniformBufferSize / 256) * 256;
const tempVec = new Vector3();
const uniformData = new Float32Array(alignedUniformBufferSize / 4);
const invViewProjectionMatrix = new Matrix4();

export class SkyCompositePass implements IPostProcess {
  renderTarget: GPUTexture; // unused — composite renders directly to swapchain pass
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  manager: PostProcessManager;
  scaleFactor: number;
  atmosphereTexture: GPUTexture | null;
  cloudsTexture: GPUTexture | null;
  cloudShadowMap: GPUTexture | null;
  godRaysTexture: GPUTexture | null;
  bloomTexture: GPUTexture | null;

  cloudiness: number;
  elevation: number;
  azimuth: number;

  constructor() {
    this.scaleFactor = 1;
    this.atmosphereTexture = null;
    this.cloudsTexture = null;
    this.cloudShadowMap = null;
    this.godRaysTexture = null;
    this.bloomTexture = null;
  }

  init(renderer: Renderer): IPostProcess {
    const { device, presentationFormat } = renderer;

    const module = device.createShaderModule({
      code: constantsFn + commonShaderFns + shader,
    });

    const vertexScreenQuadModule = device.createShaderModule({
      code: vertexScreenQuadShader,
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
        { binding: 3, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 4, resource: renderer.depthTexture.createView() },
        { binding: 5, resource: this.cloudShadowMap!.createView() },
        { binding: 6, resource: this.godRaysTexture!.createView() },
        { binding: 7, resource: this.bloomTexture!.createView() },
      ],
    });

    return this;
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
  }

  private setupFinalPassUniforms(renderer: Renderer, camera: Camera) {
    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);
    const sunPosition = tempVec.setFromSphericalCoords(1, phi, theta);

    const canvas = renderer.canvas;

    invViewProjectionMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();

    uniformData.set(invViewProjectionMatrix.elements, 0);
    uniformData.set(camera.transform.matrixWorld.elements, 16);

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
        0,
        renderer.sky.skyRenderer.foginess,
        renderer.sky.skyRenderer.cloudShadowRenderer.config.worldSize,
        renderer.sky.skyRenderer.fogShadowIntensity,
        renderer.sky.skyRenderer.lightningFlash,
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
