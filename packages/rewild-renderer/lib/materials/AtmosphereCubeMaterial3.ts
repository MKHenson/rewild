import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/atmosphereCloudsPass.wgsl';
import atmosphereNightShader from '../shaders/atmosphereAndNightSky.wgsl';
import bloomShader from '../shaders/atmosphereBloomPass.wgsl';
import taaShader from '../shaders/atmosphereTAAPass.wgsl';
// import taaShader from '../shaders/atmosphereBlurPass.wgsl';
import finalShader from '../shaders/atmosphereFinal.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { degToRad, Vector3 } from 'rewild-common';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';

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

const finalUniformBufferSize =
  64 + // invProjectionMatrix
  8 + // resolutionXY
  4 + // iTime
  4 + // cloudiness
  16 + // sunPosition
  16 + // cameraPosition
  4; // padding

const alignedFinalUniformBufferSize =
  Math.ceil(finalUniformBufferSize / 256) * 256;

const bloomPassUniformBufferSize =
  2 * 4 + // (resolutionX, resolutionY)
  4; // iTime

const alignedbloomPassUniformBufferSize =
  Math.ceil(bloomPassUniformBufferSize / 256) * 256;

// Align the buffer size to the next multiple of 256
const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 256) * 256;

export class AtmosphereCubeMaterial3 implements IMaterialPass {
  cloudsPipeline: GPURenderPipeline;
  atmospherePipeline: GPURenderPipeline;
  bloomPipeline: GPURenderPipeline;
  taaPipeline: GPURenderPipeline;
  finalPipeline: GPURenderPipeline;

  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;

  cloudsBindGroup: GPUBindGroup;
  atmosphereBindGroup: GPUBindGroup;
  bloomBindGroup: GPUBindGroup;
  taaBindGroup: GPUBindGroup;
  finalBindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  finalUniformBuffer: GPUBuffer;
  bloomUniformBuffer: GPUBuffer;

  elevation: f32;
  azimuth: f32;
  cloudiness: f32;
  upDot: f32;

  cloudsTexture: GPUTexture;
  atmosphereTexture: GPUTexture;
  bloomTexture: GPUTexture;
  taaTexture: GPUTexture;
  prevTaaTexture: GPUTexture;

  constructor() {
    this.azimuth = 180;
    this.elevation = 2;
    this.cloudiness = 0.0;
    this.upDot = 0.0;
    this.requiresRebuild = true;

    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, pane, presentationFormat } = renderer;
    const module = device.createShaderModule({
      code: shader,
    });

    const atmosphereNightShaderModule = device.createShaderModule({
      code: atmosphereNightShader,
    });

    const bloomModule = device.createShaderModule({
      code: bloomShader,
    });

    const taaModule = device.createShaderModule({
      code: taaShader,
    });

    const finalModule = device.createShaderModule({
      code: finalShader,
    });

    const canvas = pane.canvas()!;

    const scaleFactor = 0.6;

    this.cloudsTexture = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'clouds render target',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.atmosphereTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      label: 'atmosphere render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.bloomTexture = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'bloom render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.taaTexture = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'taa render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    this.prevTaaTexture = device.createTexture({
      size: [canvas.width * scaleFactor, canvas.height * scaleFactor, 1],
      label: 'prev taa render target',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });

    canvas.addEventListener('mousemove', (e) => {
      // this.cloudiness = (e.clientY / pane.canvas()!.height);
      // Set the cloudiness as 0 when the mouse is at the bottom of the canvas
      // and 1 when it is at the top
      this.cloudiness = 1 - e.clientY / pane.canvas()!.height;
    });

    this.cloudsPipeline = device.createRenderPipeline({
      label: 'Atmosphere Plane Pass',
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

    this.atmospherePipeline = device.createRenderPipeline({
      label: 'Atmosphere & Night Pipeline',
      layout: 'auto',
      vertex: {
        module: atmosphereNightShaderModule,
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
        module: atmosphereNightShaderModule,
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

    this.bloomPipeline = device.createRenderPipeline({
      label: 'atmosphere combine pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: bloomModule,
      },
      fragment: {
        entryPoint: 'fs',
        module: bloomModule,
        targets: [
          {
            format: 'rgba8unorm',
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

    this.taaPipeline = device.createRenderPipeline({
      label: 'TAA pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: taaModule,
      },
      fragment: {
        entryPoint: 'fs',
        module: taaModule,
        targets: [
          {
            format: 'rgba8unorm',
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

    this.finalPipeline = device.createRenderPipeline({
      label: 'atmosphere final pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: finalModule,
      },
      fragment: {
        entryPoint: 'fs',
        module: finalModule,
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
      label: 'uniforms for atmosphere cube',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.finalUniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere final pass',
      size: alignedFinalUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bloomUniformBuffer = device.createBuffer({
      label: 'uniforms for atmosphere bloom pass',
      size: alignedbloomPassUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.cloudsBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere clouds',
      layout: this.cloudsPipeline.getBindGroupLayout(0),
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

    this.atmosphereBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere & nightsky',
      layout: this.atmospherePipeline.getBindGroupLayout(0),
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
        // {
        //   binding: 3,
        //   resource: textureManager.get('pebbles-512').gpuTexture.createView(),
        // },
      ],
    });

    this.bloomBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere combine',
      layout: this.bloomPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: samplerManager.get('linear-clamped') },
        { binding: 1, resource: this.cloudsTexture.createView() },
        { binding: 2, resource: { buffer: this.bloomUniformBuffer } },
      ],
    });

    this.taaBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere taa',
      layout: this.taaPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.bloomTexture.createView() },
        { binding: 1, resource: this.prevTaaTexture.createView() },
        { binding: 2, resource: { buffer: this.bloomUniformBuffer } },
        { binding: 3, resource: samplerManager.get('linear-clamped') },
      ],
    });

    // // Blur type
    // this.taaBindGroup = device.createBindGroup({
    //   label: 'bind group for atmosphere taa',
    //   layout: this.taaPipeline.getBindGroupLayout(0),
    //   entries: [
    //     { binding: 0, resource: this.bloomTexture.createView() },
    //     { binding: 1, resource: { buffer: this.bloomUniformBuffer } },
    //     { binding: 2, resource: samplerManager.get('linear-clamped') },
    //   ],
    // });

    this.finalBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere final pass',
      layout: this.finalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.atmosphereTexture.createView() },
        { binding: 1, resource: this.taaTexture.createView() },
        { binding: 2, resource: { buffer: this.finalUniformBuffer } },
        { binding: 3, resource: samplerManager.get('linear-clamped') },
        {
          binding: 4,
          resource: renderer.depthTexture.createView(),
        },
        // {
        //   binding: 5,
        //   resource: samplerManager.get('depth-comparison'),
        // },
      ],
    });
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices && !!geometry.uvs;
  }

  private setupCloudPassUniforms(
    renderer: Renderer,
    camera: Camera,
    width: number,
    height: number,
    meshes?: Mesh[]
  ) {
    // prettier-ignore
    const uniformData = new Float32Array(alignedUniformBufferSize / 4);

    this.elevation += renderer.delta * 0.01;

    // cloudiness is a value between -0.5 and 0.5 for atmosphereWithWeather and 0 and 1 for atmosphereWithWeather2
    const cloudiness = this.cloudiness;

    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);

    const sunPosition = new Vector3().setFromSphericalCoords(1, phi, theta);

    const upDot = sunPosition.dot(new Vector3(0, 1, 0));
    this.upDot = upDot;

    const sizeOfMat4 = 4 * 4;
    const sizeOfVec4 = 1 * 4;

    uniformData.set(meshes![0].transform.matrixWorld.elements, 0); // modelMatrix
    uniformData.set(camera.projectionMatrix.elements, sizeOfMat4); // projectionMatrix
    uniformData.set(
      meshes![0].transform.modelViewMatrix.elements,
      sizeOfMat4 * 2
    ); // modelViewMatrix
    uniformData.set(
      [
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
      ],
      sizeOfMat4 * 3
    ); // cameraPosition
    uniformData.set(
      [sunPosition.x, sunPosition.y, sunPosition.z],
      sizeOfMat4 * 3 + sizeOfVec4
    ); // sunPosition
    uniformData.set([0, 1, 0], sizeOfMat4 * 3 + sizeOfVec4 * 2); // up
    uniformData.set(
      [renderer.totalDeltaTime, width, height, cloudiness],
      sizeOfMat4 * 3 + sizeOfVec4 * 3
    );

    return uniformData;
  }

  private setupBloomUniforms(renderer: Renderer) {
    const bloomUniformData = new Float32Array(
      alignedbloomPassUniformBufferSize / 4
    );

    bloomUniformData.set([
      this.bloomTexture.width,
      this.bloomTexture.height,
      renderer.totalDeltaTime,
    ]);

    return bloomUniformData;
  }

  private setupFinalPassUniforms(renderer: Renderer, camera: Camera) {
    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);
    const sunPosition = new Vector3().setFromSphericalCoords(1, phi, theta);

    const canvas = renderer.pane.canvas()!;
    const uniformData = new Float32Array(alignedFinalUniformBufferSize / 4);

    uniformData.set(camera.projectionMatrixInverse.elements, 0); // modelMatrix
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
      ],
      32
    );
    return uniformData;
  }

  private renderClouds(
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
          view: this.cloudsTexture.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    cloudPass.setPipeline(this.cloudsPipeline);
    cloudPass.setVertexBuffer(0, geometry!.vertexBuffer);
    cloudPass.setVertexBuffer(1, geometry!.uvBuffer);
    cloudPass.setIndexBuffer(geometry!.indexBuffer, 'uint16');

    const uniformData = this.setupCloudPassUniforms(
      renderer,
      camera,
      this.cloudsTexture.width,
      this.cloudsTexture.height,
      meshes
    );

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    cloudPass.setBindGroup(0, this.cloudsBindGroup);
    cloudPass.drawIndexed(geometry!.indices!.length);
    cloudPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }

  private renderAtmosphere(
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
          view: this.atmosphereTexture.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    cloudPass.setPipeline(this.atmospherePipeline);
    cloudPass.setVertexBuffer(0, geometry!.vertexBuffer);
    cloudPass.setVertexBuffer(1, geometry!.uvBuffer);
    cloudPass.setIndexBuffer(geometry!.indexBuffer, 'uint16');

    const uniformData = this.setupCloudPassUniforms(
      renderer,
      camera,
      this.atmosphereTexture.width,
      this.atmosphereTexture.height,
      meshes
    );

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    cloudPass.setBindGroup(0, this.atmosphereBindGroup);
    cloudPass.drawIndexed(geometry!.indices!.length);
    cloudPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }

  private renderBloomPass(renderer: Renderer) {
    const { device } = renderer;

    const commandEncoder = device.createCommandEncoder();
    const bloomPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.bloomTexture.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    const bloomUniformData = this.setupBloomUniforms(renderer);
    device.queue.writeBuffer(
      this.bloomUniformBuffer,
      0,
      bloomUniformData.buffer
    );

    bloomPass.setPipeline(this.bloomPipeline);
    bloomPass.setBindGroup(0, this.bloomBindGroup);
    bloomPass.draw(6);
    bloomPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }

  private renderTAA(renderer: Renderer) {
    const { device } = renderer;
    let clearColorValue = 0.0;
    if (this.upDot > 0.3) {
      clearColorValue = 0.4;
    } else if (this.upDot > -0.3) {
      clearColorValue = 0.1;
    } else {
      clearColorValue = 0.0;
    }

    const commandEncoder = device.createCommandEncoder();
    const taaPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.taaTexture.createView(),
          clearValue: [clearColorValue, clearColorValue, clearColorValue, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    const bloomUniformData = this.setupBloomUniforms(renderer);
    device.queue.writeBuffer(
      this.bloomUniformBuffer,
      0,
      bloomUniformData.buffer
    );

    taaPass.setPipeline(this.taaPipeline);
    taaPass.setBindGroup(0, this.taaBindGroup);
    taaPass.draw(6);
    taaPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // Copy the taaTexture to the prevTaaTexture
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToTexture(
      {
        texture: this.taaTexture,
      },
      {
        texture: this.prevTaaTexture,
      },
      [this.taaTexture.width, this.taaTexture.height, 1]
    );

    device.queue.submit([copyEncoder.finish()]);
  }

  private finalPass(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera
  ) {
    const { device } = renderer;

    const uniformData = this.setupFinalPassUniforms(renderer, camera);
    device.queue.writeBuffer(this.finalUniformBuffer, 0, uniformData.buffer);

    pass.setPipeline(this.finalPipeline);
    pass.setBindGroup(0, this.finalBindGroup);
    pass.draw(6);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes?: Mesh[],
    geometry?: Geometry
  ): void {
    this.renderClouds(renderer, camera, meshes, geometry);
    this.renderAtmosphere(renderer, camera, meshes, geometry);
    this.renderBloomPass(renderer);
    this.renderTAA(renderer);
    this.finalPass(renderer, pass, camera);
  }
}
