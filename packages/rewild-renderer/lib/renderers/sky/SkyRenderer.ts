import { Geometry } from '../../geometry/Geometry';
import { Renderer } from '../..';
import { PerMeshTracker } from '../../materials/PerMeshTracker';
import { SharedUniformsTracker } from '../../materials/SharedUniformsTracker';
import { Transform } from '../../core/Transform';
import { Camera } from '../../core/Camera';
import { Color, degToRad } from 'rewild-common';
import { CanvasSizeWatcher } from '../../utils/CanvasSizeWatcher';
import { CloudRenderer } from './CloudRenderer';
import { SkyTAAPass } from './SkyTAAPass';
import { SkyBloomPass } from './SkyBloomPass';
import { SkyBlurPass } from './SkyBlurPass';
import { SkyCompositePass } from './SkyCompositePass';
import { SkyGradientRenderer } from './SkyGradientRenderer';
import { SkyDenoisePass } from './SkyDenoisePass';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { PerformanceMonitor } from '../../utils/PerformanceMonitor';
import { StarfieldRenderer } from './StarfieldRenderer';
import { CloudShadowRenderer } from './CloudShadowRenderer';

export class SkyRenderer {
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;

  cloudsBindGroup: GPUBindGroup;
  atmosphereBindGroup: GPUBindGroup;
  cloudsPass: CloudRenderer;
  atmospherePass: SkyGradientRenderer;
  taaPass: SkyTAAPass;
  blurPass: SkyBlurPass;
  bloomPass: SkyBloomPass;
  denoisePass: SkyDenoisePass;
  finalPass: SkyCompositePass;
  starfieldRenderer: StarfieldRenderer;
  cloudShadowRenderer: CloudShadowRenderer;

  elevation: f32;
  dayNightCycle: boolean = false;
  azimuth: f32;
  cloudiness: f32;
  foginess: f32;
  fogShadowIntensity: f32;
  windiness: f32;
  upDot: f32;
  sun: DirectionLight;

  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;

  canvasSizeWatcher: CanvasSizeWatcher;

  _dayColor: Color;
  _eveColor: Color;
  _nightColor: Color;

  perfMonitor: PerformanceMonitor;

  constructor(parent: Transform) {
    this.azimuth = 180;
    this.elevation = -0;
    this.cloudiness = 0.7;
    this.foginess = 0.3;
    this.fogShadowIntensity = 0.6;
    this.windiness = 0.5;
    this.upDot = 0.0;
    this.sun = new DirectionLight();
    this.sun.intensity = 2.0;
    parent.addChild(this.sun.transform);
    this.requiresRebuild = true;

    this._dayColor = new Color(1, 1, 1);
    this._eveColor = new Color(0.32, 0.12, 0.0);
    this._nightColor = new Color(0.05, 0.05, 0.2);

    this.cloudsPass = new CloudRenderer();
    this.atmospherePass = new SkyGradientRenderer();
    this.taaPass = new SkyTAAPass();
    this.denoisePass = new SkyDenoisePass();
    this.blurPass = new SkyBlurPass();
    this.bloomPass = new SkyBloomPass();
    this.finalPass = new SkyCompositePass();
    this.starfieldRenderer = new StarfieldRenderer();
    this.cloudShadowRenderer = new CloudShadowRenderer({
      resolution: 1024,
      worldSize: 5000,
      updateFrequency: 2,
    });
    this.perfMonitor = new PerformanceMonitor();
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
    this.starfieldRenderer.init(renderer);
    this.cloudShadowRenderer.init(renderer);
    this.atmospherePass.init(
      renderer,
      this.uniformBuffer,
      this.starfieldRenderer.cubemap
    );

    this.bloomPass.sourceTexture = this.cloudsPass.renderTarget;
    this.bloomPass.init(renderer);

    // this.blurPass.sourceTexture = this.bloomPass.renderTarget;
    // this.blurPass.init(renderer);

    this.taaPass.sourceTexture = this.bloomPass.renderTarget;
    this.taaPass.init(renderer);

    this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
    this.finalPass.cloudsTexture = this.blurPass.renderTarget;
    this.finalPass.cloudsTexture = this.taaPass.renderTarget;
    this.finalPass.cloudShadowMap = this.cloudShadowRenderer.shadowMap;
    this.finalPass.init(renderer);

    this.perfMonitor.init(device, [
      'sky-cloud-shadow',
      'sky-clouds',
      'sky-atmosphere',
      'sky-bloom',
      'sky-taa',
    ]);

    (window as any).startSkyPerfCapture = () => {
      this.perfMonitor.enabled = true;
      console.log('Sky performance capture started');
    };
    (window as any).stopSkyPerfCapture = () => {
      this.perfMonitor.enabled = false;
      console.log('Sky performance capture stopped');
    };

    (window as any).toggleCloudShadowDebug = () => {
      const config = this.cloudShadowRenderer.config;
      console.log(
        `Cloud Shadow Map: ${config.resolution}x${config.resolution}, ` +
          `worldSize=${config.worldSize}m, updateFreq=every ${config.updateFrequency} frames`
      );
    };
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
    const sunPosition = this.sun.transform.position;
    const uniformData = this.uniformData;

    // Sun orbital distance (arbitrary units for spherical coordinate placement)
    const sunOrbitDistance = 100;
    sunPosition.setFromSphericalCoords(sunOrbitDistance, phi, theta);

    // Normalized sun elevation: -1 = nadir, 0 = horizon, +1 = zenith.
    // Same value as sunDotUp in the sky shaders.
    const sunDotUp = sunPosition.y / sunOrbitDistance;
    this.upDot = sunDotUp;

    // Directional light color — transitions aligned with shader dusk/dawn at ±10%:
    //   sunDotUp < -0.1  → full night (dark blue moonlight)
    //   -0.1  to  0.0    → night → evening (warm orange)
    //    0.0  to  0.3    → evening → day (orange fades to white sunlight)
    //   sunDotUp > 0.3   → full daylight (white)
    if (sunDotUp < -0.1) {
      this.sun.color.copy(this._nightColor);
    } else if (sunDotUp < 0.0) {
      const t = (sunDotUp + 0.1) / 0.1;
      this.sun.color.lerpColors(this._nightColor, this._eveColor, t);
    } else if (sunDotUp < 0.3) {
      const t = sunDotUp / 0.3;
      this.sun.color.lerpColors(this._eveColor, this._dayColor, t);
    } else {
      this.sun.color.copy(this._dayColor);
    }

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

    // Render cloud shadow map (every N frames)
    const sunPosition = this.sun.transform.position;
    const sunDir = Math.sqrt(
      sunPosition.x * sunPosition.x +
        sunPosition.y * sunPosition.y +
        sunPosition.z * sunPosition.z
    );
    this.cloudShadowRenderer.render(
      device,
      commandEncoder,
      camera.transform.position.x,
      camera.transform.position.z,
      renderer.totalDeltaTime * 0.3,
      this.cloudiness,
      this.windiness,
      sunPosition.x / sunDir,
      sunPosition.y / sunDir,
      sunPosition.z / sunDir,
      this.perfMonitor.getTimestampWrites('sky-cloud-shadow')
    );

    this.cloudsPass.render(
      commandEncoder,
      geometry,
      this.perfMonitor.getTimestampWrites('sky-clouds')
    );
    this.atmospherePass.render(
      commandEncoder,
      geometry,
      this.perfMonitor.getTimestampWrites('sky-atmosphere')
    );

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    this.bloomPass.render(
      renderer,
      this.perfMonitor.getTimestampWrites('sky-bloom')
    );
    // this.blurPass.render(renderer);
    this.taaPass.render(
      renderer,
      this.perfMonitor.getTimestampWrites('sky-taa')
    );

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.finalPass.render(renderer, pass, camera);

    this.perfMonitor.resolveAndLog();
  }

  dispose() {
    this.perfMonitor.dispose();
    this.starfieldRenderer.dispose();
    this.cloudShadowRenderer.dispose();
    this.taaPass.dispose();
    this.blurPass.dispose();
    this.bloomPass.dispose();
    this.denoisePass.dispose();
    this.finalPass.dispose();
  }
}
