import { Geometry } from '../../geometry/Geometry';
import { Renderer } from '../..';
import { PerMeshTracker } from '../PerMeshTracker';
import { SharedUniformsTracker } from '../SharedUniformsTracker';
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
  azimuth: f32;
  cloudiness: f32;
  upDot: f32;
  sunPosition: Vector3;

  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;

  canvasSizeWatcher: CanvasSizeWatcher;

  constructor() {
    this.azimuth = 180;
    this.elevation = -2;
    this.cloudiness = 0.7;
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
    const { pane, device } = renderer;
    const canvas = pane.canvas()!;
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
        4; // cloudiness

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

    this.blurPass.sourceTexture = this.bloomPass.renderTarget;
    this.blurPass.init(renderer);

    this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
    this.finalPass.cloudsTexture = this.blurPass.renderTarget;
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
    this.elevation += renderer.delta * 0.002;

    // change the cloudiness over time between 0 and 1
    if (this.cloudiness > 1) {
      this.addingCloudiness = false;
    } else if (this.cloudiness < 0) {
      this.addingCloudiness = true;
    }

    this.cloudiness +=
      renderer.delta * (this.addingCloudiness ? 0.0001 : -0.0001);

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
      [renderer.totalDeltaTime * 0.3, width, height, cloudiness],
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

    const { pane, device } = renderer;
    const canvas = pane.canvas()!;

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
    this.blurPass.render(renderer);

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.finalPass.render(renderer, pass, camera);
  }
}
