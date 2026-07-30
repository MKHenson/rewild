import { IPostProcess } from '../../../types/IPostProcess';
import { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/skyComposite.wgsl';
import blendShader from '../../shaders/sky/skyBlend.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';
import constantsFn from '../../shaders/sky/skyConstants.wgsl';
import commonShaderFns from '../../shaders/sky/fog.wgsl';
import { PostProcessManager } from '../../post-processes/PostProcessManager';
import { Camera } from '../../core/Camera';
import { degToRad, Matrix4, Vector3 } from 'rewild-common';

const finalUniformBufferSize =
  64 + // invViewProjectionMatrix
  64 + // invViewMatrix
  8 + // resolutionXY
  4 + // iTime
  4 + // cloudiness
  16 + // sunPosition (vec3f, padded to its 16-byte alignment)
  16 + // cameraPosition (vec3f, padded)
  4 + // padding0
  4 + // foginess
  4 + // temperature
  4 + // lightningFlash
  4 + // exposure
  0;

const alignedUniformBufferSize = Math.ceil(finalUniformBufferSize / 256) * 256;
const BLEND_UNIFORM_SIZE = Math.ceil(16 / 256) * 256; // resolution vec2f + cloudsGated + pad

/** Mirrors CLOUD_START in shaders/sky/skyConstants.wgsl. Below this altitude the
 *  cloud pass depth-gates, leaving vec4f(0) on terrain-occluded texels. */
const CLOUD_START = 500.0;

// Reused across frames — renderBlend runs every frame and must not allocate.
const blendData = new Float32Array(BLEND_UNIFORM_SIZE / 4);

const tempVec = new Vector3();
const uniformData = new Float32Array(alignedUniformBufferSize / 4);
const invViewProjectionMatrix = new Matrix4();

export class SkyCompositePass implements IPostProcess {
  renderTarget: GPUTexture; // unused — composite renders directly to swapchain pass
  intermediateTarget: GPUTexture; // HDR sky+clouds blend; fed to bloom and final pass
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  manager: PostProcessManager;
  scaleFactor: number;
  atmosphereTexture: GPUTexture | null;
  cloudsTexture: GPUTexture | null;
  godRaysTexture: GPUTexture | null;

  cloudiness: number;
  elevation: number;
  azimuth: number;

  /** Camera world Y, set by SkyRenderer each frame. Below CLOUD_START the cloud pass
   *  depth-gates, and the blend must not interpolate across the texels it left empty. */
  cameraAltitude: number = 0;

  private blendPipeline: GPURenderPipeline;
  private blendBindGroup: GPUBindGroup;
  private blendUniformBuffer: GPUBuffer;

  constructor() {
    this.scaleFactor = 1;
    this.atmosphereTexture = null;
    this.cloudsTexture = null;
    this.godRaysTexture = null;
  }

  /**
   * Phase 1: creates the intermediateTarget and the blend pipeline that reads
   * atmosphereTexture + cloudsTexture and writes an HDR sky+clouds blend with no
   * tonemapping. Call this before initialising the bloom pass so that
   * intermediateTarget can be used as the bloom source.
   */
  initBlend(renderer: Renderer): void {
    const { device, canvas } = renderer;

    this.intermediateTarget = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      label: 'sky intermediate HDR',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const blendModule = device.createShaderModule({ code: blendShader });

    this.blendPipeline = device.createRenderPipeline({
      label: 'sky HDR blend pipeline',
      layout: 'auto',
      vertex: { entryPoint: 'vs', module: blendModule },
      fragment: {
        entryPoint: 'fs',
        module: blendModule,
        targets: [{ format: 'rgba16float' }],
      },
    });

    this.blendUniformBuffer = device.createBuffer({
      label: 'sky blend uniforms',
      size: BLEND_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = renderer.samplerManager.get('linear-clamped');

    this.blendBindGroup = device.createBindGroup({
      label: 'sky blend bind group',
      layout: this.blendPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.atmosphereTexture!.createView() },
        { binding: 1, resource: this.cloudsTexture!.createView() },
        { binding: 2, resource: { buffer: this.blendUniformBuffer } },
        { binding: 3, resource: sampler },
        { binding: 4, resource: renderer.depthTexture.createView() },
      ],
    });
  }

  /**
   * Phase 2: creates the atmosphere composite pipeline. Reads intermediateTarget
   * and blends sky, clouds, fog and god rays over the HDR scene target with
   * src-alpha coverage. Outputs HDR — the whole-frame tonemap happens later, in
   * the frame compositor's tonemap pass.
   */
  initFinal(renderer: Renderer): IPostProcess {
    const { device, sceneColorFormat } = renderer;

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
            // Composites into the HDR scene target, not the swapchain.
            format: sceneColorFormat,
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
        { binding: 0, resource: this.intermediateTarget.createView() },
        { binding: 1, resource: { buffer: this.uniformBuffer } },
        { binding: 2, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 3, resource: renderer.depthTexture.createView() },
        { binding: 4, resource: this.godRaysTexture!.createView() },
      ],
    });

    return this;
  }

  /** Legacy single-call init: calls initBlend then initFinal. */
  init(renderer: Renderer): IPostProcess {
    this.initBlend(renderer);
    return this.initFinal(renderer);
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.intermediateTarget?.destroy();
    this.blendUniformBuffer?.destroy();
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
        renderer.sky.skyRenderer.temperature,
        renderer.sky.skyRenderer.lightningFlash,
        // The rayCoverage heuristic predicts how bright a shaft will read after
        // the tonemap, so it has to use the exposure that tonemap will apply.
        camera.exposure,
      ],
      32
    );
    return uniformData;
  }

  /** Blend sub-pass: sky HDR + clouds HDR → intermediateTarget (no tonemap). */
  renderBlend(renderer: Renderer): void {
    const { device, canvas } = renderer;

    blendData[0] = canvas.width;
    blendData[1] = canvas.height;
    // The cloud pass only depth-gates below the cloud layer; above it, clouds are
    // marched full-screen and every texel is valid.
    blendData[2] = this.cameraAltitude < CLOUD_START ? 1.0 : 0.0;
    device.queue.writeBuffer(this.blendUniformBuffer, 0, blendData.buffer);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.intermediateTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.blendPipeline);
    pass.setBindGroup(0, this.blendBindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
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
