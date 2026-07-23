import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Camera } from '../../core/Camera';
import { Color, degToRad, Matrix4, smoothstep, Vector2 } from 'rewild-common';
import { CanvasSizeWatcher } from '../../utils/CanvasSizeWatcher';
import { TemporalCloudRenderer } from './TemporalCloudRenderer';
import { SkyBilateralPass } from './SkyBilateralPass';
import { SkyBloomPass } from './SkyBloomPass';
import { SkyCompositePass } from './SkyCompositePass';
import { SkyGradientRenderer } from './SkyGradientRenderer';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { PerformanceMonitor } from '../../utils/PerformanceMonitor';
import { StarfieldRenderer } from './StarfieldRenderer';
import { CloudShadowRenderer } from './CloudShadowRenderer';
import { GodRaysPostProcess } from '../../post-processes/GodRaysPostProcess';
import {
  RainParticlePass,
  RainParticleParams,
} from '../../post-processes/RainParticlePass';
import { LightningController } from './LightningController';
import { LightningBoltPass } from '../../post-processes/LightningBoltPass';
import type { LightningStrike } from './LightningController';

/** How much brighter the fully-cold, fully-desaturated colour reads. 1.0 = plain
 *  grey; above that it lifts toward a pale white-out. Mirrors COLD_LIFT in
 *  fog.wgsl — keep the two in sync. */
const COLD_LIFT = 1.12;

export class SkyRenderer {
  requiresRebuild: boolean = true;
  private invViewProjectionMatrix = new Matrix4();

  /** Rotation-only copy of the camera's world-inverse (translation zeroed). */
  private centeredViewMatrix = new Matrix4();

  /** Inverse of (projection × rotation-only view). The sky shaders reconstruct
   *  ray directions from this camera-CENTERED matrix: including the camera
   *  translation makes the interpolated far-plane varying carry world-sized
   *  magnitudes, and the resulting f32 direction error grows with distance
   *  from world origin (visible as history smear in the temporal cloud pass). */
  private invViewProjCentered = new Matrix4();

  /** Current frame's view-projection matrix — stored so it can be passed to the
   *  temporal renderer as prevViewProjMatrix on the next frame. */
  private viewProjMatrix = new Matrix4();

  cloudsPass: TemporalCloudRenderer;
  atmospherePass: SkyGradientRenderer;
  bilateralPass: SkyBilateralPass;
  bloomPass: SkyBloomPass;
  finalPass: SkyCompositePass;
  godRaysPass: GodRaysPostProcess;
  rainPass: RainParticlePass;
  lightning: LightningController;
  lightningBoltPass: LightningBoltPass;
  starfieldRenderer: StarfieldRenderer;
  cloudShadowRenderer: CloudShadowRenderer;

  elevation: f32;
  dayNightCycle: boolean = false;
  azimuth: f32;
  cloudiness: f32;
  foginess: f32;
  cloudShadowIntensity: f32;
  windiness: f32;
  upDot: f32;
  sun: DirectionLight;

  /** Sun intensity at a neutral climate (temperature 0.5). The live
   *  sun.intensity is derived from this each frame — hot climates scale it up. */
  baseSunIntensity: f32 = 1.2;

  // God rays tunables (updatable at runtime without pipeline recreation)
  /** Master on/off switch. When false the god ray pass is skipped entirely each frame. */
  godRayEnabled: boolean = true;
  /** Master brightness multiplier (range 0–3). Scales the final ray intensity on top of the
   *  per-frame horizon fade. 0 = invisible, 1 = default, >1 = exaggerated shafts. */
  godRayIntensity: number = 2.0;
  /** How far the radial blur rays extend from the sun toward the screen edges (range 0.1–1.0).
   *  Low values (0.2) give short subtle rays; high values (0.8) give long dramatic shafts. */
  godRayDensity: number = 0.8;
  /** Per-step brightness falloff along each ray (range 0.8–0.99).
   *  Lower values (0.85) concentrate light near the sun; higher values (0.98) let rays
   *  reach further across the screen before fading out. */
  godRayDecay: number = 0.98;

  cirrusCoverage: number = 0.2;
  cirrusOpacity: number = 0.25;

  windDirection: Vector2 = new Vector2(1, 0);
  precipitation: number = 0.0;
  temperature: number = 0.5;
  lightningFlash: number = 0.0;

  private pendingBoltStrike: LightningStrike | null = null;
  private lastCameraPos: [number, number, number] = [0, 0, 0];

  private pendingRainParams: RainParticleParams | null = null;

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
    this.cloudShadowIntensity = 0.4;
    this.windiness = 0.5;
    this.upDot = 0.0;
    this.sun = new DirectionLight();
    this.sun.intensity = this.baseSunIntensity;
    parent.addChild(this.sun.transform);
    this.requiresRebuild = true;

    this._dayColor = new Color(1, 1, 1);
    this._eveColor = new Color(0.32, 0.12, 0.0);
    this._nightColor = new Color(0.05, 0.05, 0.2);

    this.cloudsPass = new TemporalCloudRenderer();
    this.atmospherePass = new SkyGradientRenderer();
    this.bilateralPass = new SkyBilateralPass();
    this.bloomPass = new SkyBloomPass();
    this.godRaysPass = new GodRaysPostProcess();
    this.rainPass = new RainParticlePass();
    this.lightning = new LightningController();
    this.lightningBoltPass = new LightningBoltPass();
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
        16 * 4 + // invViewProjectionMatrix
        3 * 4 + // cameraPosition
        4 + // resolutionScale
        4 * 4 + // sunPosition (vec3 + padding2)
        4 * 4 + // up (vec3 + padding3)
        4 + // iTime
        4 + // resolutionX
        4 + // resolutionY
        4 + // cloudiness
        4 + // foginess
        4 + // windiness
        4 + // cameraAltitude
        4 + // cirrusCoverage
        4 + // cirrusOpacity
        4 + // _skyPad0 (aligns windDirection)
        2 * 4 + // windDirection (vec2)
        4 + // precipitation
        4 + // temperature
        4 + // lightningBoost
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

    // Bilateral reads HDR clouds directly — edge-preserving smoothing, no ghosting.
    this.bilateralPass.sourceTexture = this.cloudsPass.renderTarget;
    this.bilateralPass.init(renderer);

    this.godRaysPass.cloudTexture = this.cloudsPass.renderTarget;
    this.godRaysPass.init(renderer);

    this.rainPass.init(renderer);
    this.lightningBoltPass.init(renderer);

    // Blend sub-pass creates intermediateTarget (sky HDR + clouds HDR, no tonemap).
    // Bloom then sources from the full composite so stars and atmospheric glow contribute.
    this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
    this.finalPass.cloudsTexture = this.bilateralPass.renderTarget;
    this.finalPass.godRaysTexture = this.godRaysPass.renderTarget;
    this.finalPass.initBlend(renderer);

    this.bloomPass.sourceTexture = this.finalPass.intermediateTarget;
    this.bloomPass.init(renderer);

    this.finalPass.bloomTexture = this.bloomPass.renderTarget;
    this.finalPass.initFinal(renderer);

    this.perfMonitor.init(device, [
      'sky-cloud-shadow',
      'sky-clouds',
      'sky-atmosphere',
      'sky-god-rays',
      'sky-bilateral',
      'sky-bloom',
    ]);
  }

  addingCloudiness: boolean = false;

  update(renderer: Renderer, camera: Camera, width: number, height: number) {
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

    // Climate tint. temperature 0.5 is neutral; 1 = hot (warmer, yellower), 0 =
    // cold, which desaturates toward white rather than tinting blue — see
    // applyClimateTint() in fog.wgsl for why the two ends work differently.
    // Keep the two in sync or the key light and the haze disagree about season.
    const warm = Math.max(this.temperature - 0.5, 0.0) * 2.0;
    const cool = Math.max(0.5 - this.temperature, 0.0) * 2.0;
    this.sun.color.r *= 1.0 + 0.085 * warm;
    this.sun.color.g *= 1.0 + 0.035 * warm;
    this.sun.color.b *= 1.0 - 0.07 * warm;

    const luma =
      this.sun.color.r * 0.2126 +
      this.sun.color.g * 0.7152 +
      this.sun.color.b * 0.0722;
    const cold = luma * COLD_LIFT;
    this.sun.color.r += (cold - this.sun.color.r) * cool;
    this.sun.color.g += (cold - this.sun.color.g) * cool;
    this.sun.color.b += (cold - this.sun.color.b) * cool;

    // Heavy-overcast dimming: in the 0.9→1.0 cloudiness bracket the sky is thick
    // enough that direct sun should fall off toward a dull, sunless grey. Ramps
    // the key light down to 40% by full cover, eased so it doesn't snap on at 0.9.
    const overcastDim = 1.0 - 0.8 * smoothstep(this.cloudiness, 0.9, 1.0);
    this.sun.intensity =
      this.baseSunIntensity * (1.0 + 0.15 * warm) * overcastDim;

    // Compute view-projection matrix (forward) and its inverse for ray reconstruction.
    // The forward matrix is needed by the temporal renderer for reprojection.
    this.viewProjMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.invViewProjectionMatrix.copy(this.viewProjMatrix).invert();

    // Camera-centered variant for sky ray reconstruction (see field docs).
    this.centeredViewMatrix.copy(camera.matrixWorldInverse);
    const cv = this.centeredViewMatrix.elements;
    cv[12] = 0;
    cv[13] = 0;
    cv[14] = 0;
    this.invViewProjCentered
      .multiplyMatrices(camera.projectionMatrix, this.centeredViewMatrix)
      .invert();

    uniformData.set(this.invViewProjCentered.elements, 0); // invViewProjectionMatrix (camera-centered)
    uniformData.set(
      [
        camera.transform.position.x,
        camera.transform.position.y,
        camera.transform.position.z,
        this.cloudsPass.resolutionScale,
      ],
      16
    ); // cameraPosition + resolutionScale
    uniformData.set([sunPosition.x, sunPosition.y, sunPosition.z], 20); // sunPosition
    uniformData.set([0, 1, 0], 24); // up
    uniformData.set(
      [
        renderer.totalDeltaTime * 0.3,
        width,
        height,
        cloudiness,
        this.foginess,
        this.windiness,
        camera.transform.position.y,
        this.cirrusCoverage,
        this.cirrusOpacity,
      ],
      28
    );
    // Float index 37 = _skyPad0 (left as 0)
    // Normalize windDirection before writing
    const wdLen = Math.sqrt(
      this.windDirection.x * this.windDirection.x +
        this.windDirection.y * this.windDirection.y
    );
    const wdx = wdLen > 0 ? this.windDirection.x / wdLen : 1;
    const wdy = wdLen > 0 ? this.windDirection.y / wdLen : 0;
    uniformData.set([wdx, wdy, this.precipitation, this.temperature, 0.0], 38);

    // Extract XZ camera forward from the world matrix (-Z column)
    const m = camera.transform.matrixWorld.elements;
    const fwX = -m[8];
    const fwZ = -m[10];
    const fwLen = Math.sqrt(fwX * fwX + fwZ * fwZ);
    const cfwdX = fwLen > 0.001 ? fwX / fwLen : 0;
    const cfwdZ = fwLen > 0.001 ? fwZ / fwLen : 1;

    // Advance lightning state machine
    const strike = this.lightning.update(
      renderer.delta,
      this.cloudiness,
      this.precipitation,
      camera.transform.position,
      cfwdX,
      cfwdZ
    );

    // lightningBoost drives cloud ambient flash (float index 42)
    uniformData[42] = strike.flashIntensity * 0.6;

    // lightningFlash is read by SkyCompositePass.setupFinalPassUniforms
    this.lightningFlash = strike.flashIntensity;

    this.lastCameraPos[0] = camera.transform.position.x;
    this.lastCameraPos[1] = camera.transform.position.y;
    this.lastCameraPos[2] = camera.transform.position.z;

    return uniformData;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void {
    if (this.canvasSizeWatcher.hasResized()) this.init(renderer);

    const { canvas, device } = renderer;

    const uniformData = this.update(
      renderer,
      camera,
      canvas.width,
      canvas.height
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

    // Update temporal state: teleport detection + store prev view-proj for next frame's reprojection
    this.cloudsPass.updateTemporalState(camera, this.viewProjMatrix);

    this.cloudsPass.render(
      commandEncoder,
      this.perfMonitor.getTimestampWrites('sky-clouds')
    );
    this.atmospherePass.render(
      commandEncoder,
      this.perfMonitor.getTimestampWrites('sky-atmosphere')
    );

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // Sync god ray config tunables then render
    this.godRaysPass.config.enabled = this.godRayEnabled;
    this.godRaysPass.config.density = this.godRayDensity;
    this.godRaysPass.config.decay = this.godRayDecay;
    this.godRaysPass.intensityScale = this.godRayIntensity;
    this.godRaysPass.render(
      renderer,
      sunPosition,
      camera,
      this.upDot,
      this.perfMonitor.getTimestampWrites('sky-god-rays')
    );

    // Bilateral only uses the matrix to reconstruct ray directions, so it
    // gets the camera-centered variant for position-independent precision.
    this.bilateralPass.render(
      renderer,
      this.invViewProjCentered.elements,
      this.perfMonitor.getTimestampWrites('sky-bilateral')
    );

    // Blend sub-pass: sky HDR + bilateral HDR → intermediateTarget (no tonemap).
    // Must run before bloom so the full scene feeds the bloom threshold pass.
    this.finalPass.renderBlend(renderer);

    // Store bolt for postRender (renders before rain so it sits behind particles)
    const currentStrike = this.lightning.currentStrike;
    this.pendingBoltStrike = currentStrike.boltVisible ? currentStrike : null;

    if (this.precipitation > 0) {
      const wdLen = Math.hypot(this.windDirection.x, this.windDirection.y);
      const wdx = wdLen > 0 ? this.windDirection.x / wdLen : 1;
      const wdy = wdLen > 0 ? this.windDirection.y / wdLen : 0;
      // Wind speed in m/s: 0 = calm, 1 = 10 m/s (enough to lean rain ~46° at max windiness)
      const baseSpeed = this.windiness * 10.0;
      const t = renderer.totalDeltaTime / 1000;
      // Gust oscillation ranges approx -1..+1
      const gustAmp =
        Math.sin(t * 0.41) * 0.5 +
        Math.sin(t * 1.17) * 0.3 +
        Math.sin(t * 2.73) * 0.2;
      // Gust fraction scales with windiness: calm wind = no gusts, full wind = ±40% variation
      const gustFraction = this.windiness * 0.95;
      const effSpeed = baseSpeed * (1.0 + gustFraction * gustAmp);
      const rainParams: RainParticleParams = {
        viewProj: this.viewProjMatrix.elements,
        viewProjInv: this.invViewProjectionMatrix.elements,
        cameraX: camera.transform.position.x,
        cameraY: camera.transform.position.y,
        cameraZ: camera.transform.position.z,
        windDirX: -wdx,
        windDirY: -wdy,
        windSpeed: baseSpeed,
        windSpeedEff: effSpeed,
        temperature: this.temperature,
        precipitation: this.precipitation,
        sunUpDot: this.upDot,
      };
      this.rainPass.simulate(renderer, rainParams, renderer.delta);
      this.pendingRainParams = rainParams;
    } else {
      this.pendingRainParams = null;
    }

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.bloomPass.cameraAltitude = camera.transform.position.y;
    this.bloomPass.render(
      renderer,
      this.perfMonitor.getTimestampWrites('sky-bloom')
    );
    this.finalPass.render(renderer, pass, camera);

    this.perfMonitor.resolveAndLog();
  }

  /** Called after the sky compositor is submitted — renders bolt then rain onto the canvas. */
  postRender(renderer: Renderer): void {
    if (this.pendingBoltStrike) {
      // Match fog.wgsl's exponential height fog: constant aerial haze plus the
      // ground-hugging layer's density at camera height. The bolt shader only
      // takes a scalar density, and bolt rays climb out of the layer toward the
      // cloud base, so the layer term is scaled down to an average along the path.
      const scaleHeight = 15 + 35 * this.foginess;
      const layerDensityAtCam =
        0.01 *
        this.foginess *
        this.foginess *
        Math.exp(-Math.max(this.lastCameraPos[1], 0) / scaleHeight);
      const fogDensity = 0.00002 + layerDensityAtCam * 0.15;
      this.lightningBoltPass.render(
        renderer,
        this.pendingBoltStrike,
        this.viewProjMatrix.elements,
        this.lastCameraPos,
        fogDensity
      );
    }
    if (this.pendingRainParams) {
      this.rainPass.render(renderer, this.pendingRainParams);
    }
  }

  /** Current lightning flash intensity (0–1). Read each frame by the game's
   *  directional light system to lerp the light colour toward white. */
  get lightningFlashIntensity(): number {
    return this.lightning.currentStrike.flashIntensity;
  }

  /**
   * Trigger a lightning strike immediately.
   * @param worldPos  - optional world-space XZ strike position [x, y, z];
   *                    Y is ignored — the bolt always starts at cloud base altitude.
   */
  triggerLightning(worldPos?: [number, number, number]): void {
    this.lightning.triggerStrike(worldPos);
  }

  dispose() {
    this.perfMonitor.dispose();
    this.starfieldRenderer.dispose();
    this.cloudShadowRenderer.dispose();
    this.bilateralPass.dispose();
    this.bloomPass.dispose();
    this.godRaysPass.dispose();
    this.rainPass.dispose();
    this.lightningBoltPass.dispose();
    this.finalPass.dispose();
  }
}
