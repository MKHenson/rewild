import { Geometry } from '../../geometry/Geometry';
import { Renderer } from '../..';
import { PerMeshTracker } from '../../materials/PerMeshTracker';
import { SharedUniformsTracker } from '../../materials/SharedUniformsTracker';
import { Transform } from '../../core/Transform';
import { Camera } from '../../core/Camera';
import { degToRad, Vector3 } from 'rewild-common';
import { CanvasSizeWatcher } from '../../utils/CanvasSizeWatcher';
import { CloudsRenderer } from './CloudsRenderer';
import { TAAPostProcess } from '../../post-processes/TAAPostProcess';
import { BloomPostProcess } from '../../post-processes/BloomPostProcess';
import { BlurProcess } from '../../post-processes/BlurProcess';
import { FinalCompPostProcess } from '../../post-processes/FinalCompPostProcess';
import { AtmosphereRenderer } from './AtmosphereRenderer';
import { DenoiseProcess } from '../../post-processes/DenoiseProcess';

export class SkyRenderer {
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;

  cloudsBindGroup: GPUBindGroup;
  atmosphereBindGroup: GPUBindGroup;
  cloudsPass: CloudsRenderer;
  atmospherePass: AtmosphereRenderer;
  taaPass: TAAPostProcess;
  blurPass: BlurProcess;
  bloomPass: BloomPostProcess;
  denoisePass: DenoiseProcess;
  finalPass: FinalCompPostProcess;

  elevation: f32;
  dayNightCycle: boolean = false;
  azimuth: f32;
  cloudiness: f32;
  foginess: f32;
  windiness: f32;
  upDot: f32;
  sunPosition: Vector3;

  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;

  canvasSizeWatcher: CanvasSizeWatcher;

  constructor() {
    this.azimuth = 180;
    this.elevation = -0;
    this.cloudiness = 0.7;
    this.foginess = 0.3;
    this.windiness = 0.5;
    this.upDot = 0.0;
    this.sunPosition = new Vector3();
    this.requiresRebuild = true;

    this.cloudsPass = new CloudsRenderer();
    this.atmospherePass = new AtmosphereRenderer();
    this.taaPass = new TAAPostProcess();
    this.denoisePass = new DenoiseProcess();
    this.blurPass = new BlurProcess();
    this.bloomPass = new BloomPostProcess();
    this.finalPass = new FinalCompPostProcess();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { canvas, device } = renderer;
    this.canvasSizeWatcher = new CanvasSizeWatcher(canvas);

    if (!this.uniformBuffer) {
      const uniformBufferSize =
        16 * 4 + // modelMatrix
        16 * 4 + // projectionMatrix
        16 * 4 + // modelViewMatrix
        3 * 4 + // cameraPosition
        4 + // resolutionScale
        4 * 4 + // sunPosition
        4 * 4 + // up
        4 + // iTime
        4 + // resolutionX
        4 + // resolutionY
        4 + // cloudiness
        4 + // foginess
        4 + // windiness
        0;

      // Align the buffer size to the next multiple of 256
      const alignedUniformBufferSize = Math.ceil(uniformBufferSize / 256) * 256;

      this.uniformData = new Float32Array(alignedUniformBufferSize / 4);

      this.uniformBuffer = device.createBuffer({
        label: 'uniforms for atmosphere & nightsky',
        size: alignedUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    this.cloudsPass.init(renderer, this.uniformBuffer);
    this.atmospherePass.init(renderer, this.uniformBuffer);

    this.bloomPass.sourceTexture = this.cloudsPass.renderTarget;
    this.bloomPass.init(renderer);

    // this.blurPass.sourceTexture = this.bloomPass.renderTarget;
    // this.blurPass.init(renderer);

    this.taaPass.sourceTexture = this.bloomPass.renderTarget;
    this.taaPass.init(renderer);

    this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
    this.finalPass.cloudsTexture = this.blurPass.renderTarget;
    this.finalPass.cloudsTexture = this.taaPass.renderTarget;
    this.finalPass.init(renderer);
  }

  addingCloudiness: boolean = false;

  update(
    renderer: Renderer,
    camera: Camera,
    width: number,
    height: number,
    transform: Transform
  ) {
    if (this.dayNightCycle) this.elevation += renderer.delta * 0.002;

    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);

    const cloudiness = this.cloudiness;
    const sunPosition = this.sunPosition;
    const uniformData = this.uniformData;

    sunPosition.setFromSphericalCoords(1, phi, theta);

    uniformData.set(transform.matrixWorld.elements, 0); // modelMatrix
    uniformData.set(camera.projectionMatrix.elements, 16); // projectionMatrix
    uniformData.set(transform.modelViewMatrix.elements, 32); // modelViewMatrix
    uniformData.set(
      [
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
        this.cloudsPass.resolutionScale,
      ],
      48
    ); // cameraPosition
    uniformData.set([sunPosition.x, sunPosition.y, sunPosition.z], 52); // sunPosition
    uniformData.set([0, 1, 0], 56); // up
    uniformData.set(
      [
        renderer.totalDeltaTime * 0.3,
        width,
        height,
        cloudiness,
        this.foginess,
        this.windiness,
      ],
      60
    );

    return uniformData;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    transform: Transform,
    geometry: Geometry
  ): void {
    if (this.canvasSizeWatcher.hasResized()) this.init(renderer);

    const { canvas, device } = renderer;

    const uniformData = this.update(
      renderer,
      camera,
      canvas.width,
      canvas.height,
      transform
    );

    // upload the uniform values to the uniform buffer
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    const commandEncoder = device.createCommandEncoder();

    this.cloudsPass.render(commandEncoder, geometry);
    this.atmospherePass.render(commandEncoder, geometry);

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    this.bloomPass.render(renderer);
    // this.blurPass.render(renderer);
    this.taaPass.render(renderer);

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.finalPass.render(renderer, pass, camera);
  }
}
