import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/atmosphereCloudsPass.wgsl';
import atmosphereNightShader from '../shaders/atmosphereAndNightSky.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { degToRad, Vector3 } from 'rewild-common';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';
import { CanvasSizeWatcher } from '../utils/CanvasSizeWatcher';
import { CloudsRenderer } from '../post-processes/CloudsRenderer';
import { TAAPostProcess } from '../post-processes/TAAPostProcess';
import { BloomPostProcess } from '../post-processes/BloomPostProcess';
import { BlurProcess } from '../post-processes/BlurProcess';
import { FinalCompPostProcess } from '../post-processes/FinalCompPostProcess';

export class AtmosphereCubeMaterial3 implements IMaterialPass {
  cloudsPipeline: GPURenderPipeline;
  atmospherePipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;

  cloudsBindGroup: GPUBindGroup;
  atmosphereBindGroup: GPUBindGroup;
  cloudsPass: CloudsRenderer;
  taaPass: TAAPostProcess;
  blurPass: BlurProcess;
  bloomPass: BloomPostProcess;
  finalPass: FinalCompPostProcess;

  elevation: f32;
  azimuth: f32;
  cloudiness: f32;
  upDot: f32;

  atmosphereTexture: GPUTexture;
  sunPosition: Vector3;

  canvasSizeWatcher: CanvasSizeWatcher;

  constructor() {
    this.azimuth = 180;
    this.elevation = -2;
    this.cloudiness = 0.5;
    this.upDot = 0.0;
    this.sunPosition = new Vector3();
    this.requiresRebuild = true;

    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);

    this.cloudsPass = new CloudsRenderer(this.sunPosition);
    this.taaPass = new TAAPostProcess();
    this.blurPass = new BlurProcess();
    this.bloomPass = new BloomPostProcess();
    this.finalPass = new FinalCompPostProcess();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, pane } = renderer;

    this.cloudsPass.init(renderer);

    const module = device.createShaderModule({
      code: shader,
    });

    const atmosphereNightShaderModule = device.createShaderModule({
      code: atmosphereNightShader,
    });

    const canvas = pane.canvas()!;

    this.canvasSizeWatcher = new CanvasSizeWatcher(canvas);

    this.atmosphereTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      label: 'atmosphere render target',
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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

    this.atmosphereBindGroup = device.createBindGroup({
      label: 'bind group for atmosphere & nightsky',
      layout: this.atmospherePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.cloudsPass.uniformBuffer },
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
      ],
    });

    this.bloomPass.sourceTexture = this.cloudsPass.renderTarget;
    this.bloomPass.init(renderer);

    this.blurPass.sourceTexture = this.bloomPass.renderTarget;
    this.blurPass.init(renderer);

    this.finalPass.atmosphereTexture = this.atmosphereTexture;
    this.finalPass.cloudsTexture = this.blurPass.renderTarget;
    this.finalPass.init(renderer);
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices && !!geometry.uvs;
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

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(
      this.cloudsPass.uniformBuffer,
      0,
      this.cloudsPass.uniformData.buffer
    );

    cloudPass.setBindGroup(0, this.atmosphereBindGroup);
    cloudPass.drawIndexed(geometry!.indices!.length);
    cloudPass.end();

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes?: Mesh[],
    geometry?: Geometry
  ): void {
    if (this.canvasSizeWatcher.hasResized()) this.init(renderer);

    this.elevation += renderer.delta * 0.002;

    // cloudiness is a value between -0.5 and 0.5 for atmosphereWithWeather and 0 and 1 for atmosphereWithWeather2
    const cloudiness = this.cloudiness;
    this.cloudsPass.cloudiness = cloudiness;

    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);
    this.sunPosition.setFromSphericalCoords(1, phi, theta);

    this.cloudsPass.render(renderer, camera, meshes, geometry);
    this.renderAtmosphere(renderer, camera, meshes, geometry);
    this.bloomPass.render(renderer);
    this.blurPass.render(renderer);

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.finalPass.render(renderer, pass, camera);
  }
}
