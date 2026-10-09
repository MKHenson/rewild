import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Camera } from '../../core/Camera';
import {
  Color,
  degToRad,
  Matrix4,
  smoothstep,
  Vector2,
  Vector3,
} from 'rewild-common';
import { CanvasSizeWatcher } from '../../utils/CanvasSizeWatcher';
import {
  bilateralSigmas,
  cloudResolutionScale,
  cloudShadowConfig,
  godRaySamples,
  godRayScale,
} from './SkyQuality';
import { TemporalCloudRenderer } from './TemporalCloudRenderer';
import { WindState } from './WindState';
import { SkyBilateralPass } from './SkyBilateralPass';
import { SkyCompositePass } from './SkyCompositePass';
import { SkyGradientRenderer } from './SkyGradientRenderer';
import { DirectionLight } from '../../core/lights/DirectionLight';
import { GpuPassTimer } from '../../metrics/GpuPassTimer';
import { StarfieldRenderer } from './StarfieldRenderer';
import { CloudShadowRenderer } from './CloudShadowRenderer';
import { SkyCubeCapture } from './SkyCubeCapture';
import { SkyCubeDebugRenderer } from './SkyCubeDebugRenderer';
import { SkyIblPrefilter } from './SkyIblPrefilter';
import { GodRaysPostProcess } from '../../post-processes/GodRaysPostProcess';
import {
  RainParticlePass,
  RainParticleParams,
} from '../../post-processes/RainParticlePass';
import { LightningController } from './LightningController';
import { LightningBoltPass } from '../../post-processes/LightningBoltPass';
import type { LightningStrike } from './LightningController';
import { RainWetness, rainShare } from './RainWetness';
import { LightningFlash } from './LightningFlash';
import { Moon, MOON_COLOR } from './Moon';

/** How much brighter the fully-cold, fully-desaturated colour reads. 1.0 = plain
 *  grey; above that it lifts toward a pale white-out. Mirrors COLD_LIFT in
 *  fog.wgsl — keep the two in sync. */
const COLD_LIFT = 1.12;

/** The wind the rain is blown by, in m/s, at `windiness` 0..1: 10 m/s a unit
 *  in light wind, climbing to 24 m/s in a gale, near the ocean's (22 m/s), so
 *  rain is driven as hard as the trees thrash. */
/** Rain drops under a full storm sky, as a share of their brightness in a clear one. */
export const RAIN_STORM_LIGHT = 0.6;
/** Cloudiness from which the sky starts to dim the rain. */
const RAIN_LIGHT_CLOUD_FROM = 0.5;

export function rainWindSpeed(windiness: number): number {
  const w = Math.min(1, Math.max(0, windiness));
  return 10 * w + 14 * w * w * w;
}

/** How bright rain drops look under the sky they fall from, 0..1: dimmed as
 *  the cloud thickens to a storm, and lit up by a lightning `flash` 0..1. */
export function rainLight(cloudiness: number, flash: number): number {
  const overcast = smoothstep(cloudiness, RAIN_LIGHT_CLOUD_FROM, 1);
  const light = 1 - (1 - RAIN_STORM_LIGHT) * overcast;
  return light + (1 - light) * Math.min(1, Math.max(0, flash));
}

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
  finalPass: SkyCompositePass;
  godRaysPass: GodRaysPostProcess;
  rainPass: RainParticlePass;
  lightning: LightningController;
  /** The light a lightning flash throws on the world. */
  flash: LightningFlash;
  lightningBoltPass: LightningBoltPass;
  starfieldRenderer: StarfieldRenderer;
  cloudShadowRenderer: CloudShadowRenderer;

  /** Atmosphere captured to a cubemap — the source for Lichen's sky-driven IBL. */
  cubeCapture: SkyCubeCapture;
  /** Turns that capture into irradiance, prefiltered specular and the BRDF map. */
  iblPrefilter: SkyIblPrefilter;
  /** On-screen viewer for the captured faces; off unless a console command turns it on. */
  cubeDebugRenderer: SkyCubeDebugRenderer;

  elevation: f32;
  azimuth: f32;
  cloudiness: f32;
  foginess: f32;
  cloudShadowIntensity: f32;
  windiness: f32;
  upDot: f32;
  /** The light the world is lit by: the sun by day, the moon by night. Its
   *  cascade and cloud shadows follow whichever it is. */
  keyLight: DirectionLight;
  /** Where the sun is, at orbit distance. The sky is drawn from this, not
   *  from keyLight, which leaves the sun at night. */
  readonly sunPosition = new Vector3();
  readonly moon = new Moon();

  /** Sun intensity at a neutral climate (temperature 0.5). The live
   *  keyLight.intensity is derived from this each frame — hot climates scale it up. */
  baseSunIntensity: f32 = 120;

  // God rays tunables (updatable at runtime without pipeline recreation)
  /** Master on/off switch. When false the god ray pass is skipped entirely each frame. */
  godRayEnabled: boolean = true;
  /** Master brightness multiplier (range 0–3). Scales the final ray intensity on top of the
   *  per-frame horizon fade. 0 = invisible, 1 = default, >1 = exaggerated shafts. */
  godRayIntensity: number = 2.0;
  /** Fraction of the pixel→sun distance the march covers (range 0.1–1.0). At 1.0 the
   *  march reaches the sun itself, which gives the longest, most sharply converging
   *  shafts; lower values stop short and leave a softer glow near the sun. */
  godRayDensity: number = 0.9;
  /** Per-step brightness falloff along each ray (range 0.8–0.99).
   *  Lower values (0.85) concentrate light near the sun; higher values (0.98) let rays
   *  reach further across the screen before fading out. */
  godRayDecay: number = 0.98;

  cirrusCoverage: number = 0.1;
  cirrusOpacity: number = 0.2;

  /** Quality revision this chain was last built against; -1 until first build. */
  private builtQualityRevision: number = -1;

  /** Bearing in degrees the air moves toward: 0 = +x, 90 = +z. */
  windBearing: f32 = 180;
  private readonly _windDirection = new Vector2(1, 0);
  /** The wind as foliage reads it, resolved from windiness and windDirection
   *  at the top of every frame — see Sky.update. */
  readonly wind = new WindState();
  precipitation: number = 0.0;
  temperature: number = 0.5;
  lightningFlash: number = 0.0;
  /** How wet the rain has left every lit surface. */
  readonly rainWetness = new RainWetness();

  private pendingBoltStrike: LightningStrike | null = null;
  private lastCameraPos: [number, number, number] = [0, 0, 0];

  private pendingRainParams: RainParticleParams | null = null;
  /** Radians a screen pixel spans, from the last update. */
  private pixelAngle = 0.001;

  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;

  canvasSizeWatcher: CanvasSizeWatcher;

  _dayColor: Color;
  _eveColor: Color;

  gpuTimer: GpuPassTimer;

  /** Where the clouds and rain are advected from: the unit vector opposite
   *  windBearing, since both sample their fields at position + windDirection. */
  get windDirection(): Vector2 {
    const radians = degToRad(this.windBearing);
    return this._windDirection.set(-Math.cos(radians), -Math.sin(radians));
  }

  constructor(parent: Transform) {
    this.azimuth = 180;
    this.elevation = -0;
    this.cloudiness = 0.7;
    this.foginess = 0.3;
    this.cloudShadowIntensity = 0.6;
    this.windiness = 0.5;
    this.upDot = 0.0;
    this.keyLight = new DirectionLight();
    this.keyLight.intensity = this.baseSunIntensity;
    parent.addChild(this.keyLight.transform);
    this.flash = new LightningFlash(parent);
    this.requiresRebuild = true;

    this._dayColor = new Color(1, 1, 1);
    this._eveColor = new Color(0.32, 0.12, 0.0);

    this.cloudsPass = new TemporalCloudRenderer();
    this.atmospherePass = new SkyGradientRenderer();
    this.bilateralPass = new SkyBilateralPass();
    this.godRaysPass = new GodRaysPostProcess();
    this.rainPass = new RainParticlePass();
    this.lightning = new LightningController();
    this.lightningBoltPass = new LightningBoltPass();
    this.finalPass = new SkyCompositePass();
    this.starfieldRenderer = new StarfieldRenderer();
    this.cloudShadowRenderer = new CloudShadowRenderer({ worldSize: 5000 });
    this.cubeCapture = new SkyCubeCapture();
    this.iblPrefilter = new SkyIblPrefilter();
    this.cubeDebugRenderer = new SkyCubeDebugRenderer();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;

    // A rebuild recompiles pipelines, and the frame after one can cost a
    // hundred milliseconds on the GPU. Left in the window that single sample
    // dominates every mean, so the numbers start again from here.
    renderer.metrics.reset();

    // Tiers come from the app-wide setting rather than a copy held here, and are
    // read per aspect so a user who has pinned one subsystem gets that tier.
    //
    // cloudsQuality drives the bilateral as well as the cloud march: the cloud
    // shader's depth-gate erosion is sized from the bilateral's kernel radius,
    // so on two different tiers the gate would stop covering the filter and
    // terrain ridges would pick up a dark outline. See QualityAspect.
    const cloudsQuality = renderer.quality.aspect('clouds');
    const godRaysQuality = renderer.quality.aspect('godRays');
    const cloudShadowsQuality = renderer.quality.aspect('cloudShadows');
    this.builtQualityRevision = renderer.quality.revision;

    // Push the tier into each pass before any of them builds a module. The
    // passes hold it as a plain field rather than reacting to it themselves:
    // rebuilding one in isolation would leave the passes downstream of it bound
    // to a texture it had already replaced, so the rebuild is always this
    // whole-chain init.
    //
    // God rays are the exception — that shader reads its sample count from a
    // uniform, so the tier is just a number and costs no recompile.
    this.cloudsPass.quality = cloudsQuality;
    this.cloudShadowRenderer.quality = cloudShadowsQuality;
    this.bilateralPass.quality = cloudsQuality;
    this.godRaysPass.config.numSamples = godRaySamples(godRaysQuality);

    // Render-target scales. These need no shader rebuild of their own, but they
    // resize textures, so they belong on this same whole-chain path. The
    // bilateral is absent on purpose: it sizes itself from the cloud target and
    // so follows cloudResolutionScale for free.
    this.cloudsPass.resolutionScale = cloudResolutionScale(cloudsQuality);
    this.godRaysPass.resolutionScale = godRayScale(godRaysQuality);

    // The cloud shadow map is sized in texels rather than as a fraction of the
    // canvas, because it covers a fixed worldSize on the ground and not the
    // view. Its update period comes down the same path: both are plain config
    // fields, and cloudShadowRenderer.init() below reads the edge to decide
    // whether to swap the texture, so they have to be assigned before it runs.
    const cloudShadows = cloudShadowConfig(cloudShadowsQuality);
    this.cloudShadowRenderer.config.resolution = cloudShadows.resolution;
    this.cloudShadowRenderer.config.updateFrequency =
      cloudShadows.updateFrequency;

    // Bilateral sigmas are uniforms rather than defines, so they are assigned
    // here alongside the scales. They go *up* as quality goes down — this pass
    // is what hides the cloud target's resolution, so a cheaper tier needs more
    // smoothing, not less.
    const sigmas = bilateralSigmas(cloudsQuality);
    this.bilateralPass.sigmaSpatial = sigmas.spatial;
    this.bilateralPass.sigmaFar = sigmas.far;
    this.bilateralPass.sigmaRange = sigmas.range;

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
        4 + // starLod (aligns windDirection)
        2 * 4 + // windDirection (vec2)
        4 + // precipitation
        4 + // temperature
        4 + // lightningBoost
        4 + // cirrusScroll
        2 * 4 + // cloudDrift (vec2)
        2 * 4 + // padding (aligns cloudFront)
        4 * 4 + // cloudFront (vec4)
        3 * 4 + // moonDirection (vec3)
        4 + // moonRadius
        4 + // moonNightRadiance
        4 + // moonDayRadiance
        4 + // moonLod
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
    const moonTexture = renderer.textureManager.get('moon').gpuTexture;
    this.moonTextureSize = moonTexture.width;
    this.atmospherePass.init(
      renderer,
      this.uniformBuffer,
      this.starfieldRenderer.cubemap,
      moonTexture
    );

    // IBL capture reuses the atmosphere pass's pipeline, so it has to be built
    // after it — and rebuilt with it, since an `auto` bind group layout is only
    // compatible with the pipeline object it came from.
    this.cubeCapture.init(
      renderer,
      this.uniformData,
      this.atmospherePass.pipeline,
      this.starfieldRenderer.cubemap,
      moonTexture
    );
    this.iblPrefilter.init(renderer, this.cubeCapture.cubemap);
    this.cubeDebugRenderer.init(
      renderer,
      this.cubeCapture.cubemap,
      this.iblPrefilter.irradianceCube,
      this.iblPrefilter.specularCube,
      this.iblPrefilter.brdfLut
    );

    // Bilateral reads HDR clouds directly — edge-preserving smoothing, no ghosting.
    this.bilateralPass.sourceTexture = this.cloudsPass.renderTarget;
    this.bilateralPass.init(renderer);

    this.godRaysPass.cloudTexture = this.cloudsPass.renderTarget;
    this.godRaysPass.init(renderer);

    this.rainPass.init(renderer);
    this.lightningBoltPass.init(renderer);

    // Blend sub-pass creates intermediateTarget (sky HDR + clouds HDR, no tonemap),
    // which the composite then blends over the HDR scene target.
    this.finalPass.atmosphereTexture = this.atmospherePass.renderTarget;
    this.finalPass.cloudsTexture = this.bilateralPass.renderTarget;
    this.finalPass.godRaysTexture = this.godRaysPass.renderTarget;
    this.finalPass.initBlend(renderer);
    this.finalPass.initFinal(renderer);

    if (!this.gpuTimer)
      this.gpuTimer = new GpuPassTimer(renderer.metrics, 'gpu/sky');
    this.gpuTimer.init(device, [
      'sky-cloud-shadow',
      'sky-clouds',
      'sky-atmosphere',
      'sky-god-rays',
      'sky-bilateral',
      'sky-cube-capture',
      'sky-ibl-prefilter',
    ]);
  }

  addingCloudiness: boolean = false;
  private moonTextureSize = 1;

  update(renderer: Renderer, camera: Camera, width: number, height: number) {
    this.rainWetness.update(
      rainShare(this.precipitation, this.temperature),
      renderer.delta / 1000
    );

    const phi = degToRad(90 - this.elevation);
    const theta = degToRad(this.azimuth);

    const cloudiness = this.cloudiness;
    const sunPosition = this.sunPosition;
    const keyLight = this.keyLight;
    const uniformData = this.uniformData;

    // Sun orbital distance (arbitrary units for spherical coordinate placement)
    const sunOrbitDistance = 100;
    sunPosition.setFromSphericalCoords(sunOrbitDistance, phi, theta);

    // Normalized sun elevation: -1 = nadir, 0 = horizon, +1 = zenith.
    // Same value as sunDotUp in the sky shaders.
    const sunDotUp = sunPosition.y / sunOrbitDistance;
    this.upDot = sunDotUp;

    // Directional light color:
    //   sunDotUp < 0.0  → evening (warm orange), held while nightFade dims it out
    //    0.0  to  0.3   → evening → day (orange fades to white sunlight)
    //   sunDotUp > 0.3  → full daylight (white)
    //
    // Sunlight has no night colour: it only gets redder and dimmer as it sets.
    // Night light comes from the moon, from where the moon is, and ambient
    // from the sky IBL.
    if (sunDotUp < 0.0) {
      keyLight.color.copy(this._eveColor);
    } else if (sunDotUp < 0.3) {
      const t = sunDotUp / 0.3;
      keyLight.color.lerpColors(this._eveColor, this._dayColor, t);
    } else {
      keyLight.color.copy(this._dayColor);
    }

    // Climate tint. temperature 0.5 is neutral; 1 = hot (warmer, yellower), 0 =
    // cold, which desaturates toward white rather than tinting blue — see
    // applyClimateTint() in fog.wgsl for why the two ends work differently.
    // Keep the two in sync or the key light and the haze disagree about season.
    const warm = Math.max(this.temperature - 0.5, 0.0) * 2.0;
    const cool = Math.max(0.5 - this.temperature, 0.0) * 2.0;
    keyLight.color.r *= 1.0 + 0.085 * warm;
    keyLight.color.g *= 1.0 + 0.035 * warm;
    keyLight.color.b *= 1.0 - 0.07 * warm;

    const luma =
      keyLight.color.r * 0.2126 +
      keyLight.color.g * 0.7152 +
      keyLight.color.b * 0.0722;
    const cold = luma * COLD_LIFT;
    keyLight.color.r += (cold - keyLight.color.r) * cool;
    keyLight.color.g += (cold - keyLight.color.g) * cool;
    keyLight.color.b += (cold - keyLight.color.b) * cool;

    // Heavy-overcast dimming: in the 0.9→1.0 cloudiness bracket the sky is thick
    // enough that direct sun should fall off toward a dull, sunless grey. Ramps
    // the key light down to 40% by full cover, eased so it doesn't snap on at 0.9.
    const overcastDim = 1.0 - 0.8 * smoothstep(this.cloudiness, 0.9, 1.0);

    // Sunlight switches off below the horizon. Same window the sun disc uses for
    // sunExtinction in cloudsTemporal.wgsl, so the light dies exactly as the disc
    // it represents does rather than out of step with it.
    const nightFade = smoothstep(sunDotUp, -0.12, 0.0);

    keyLight.intensity =
      this.baseSunIntensity * (1.0 + 0.15 * warm) * overcastDim * nightFade;
    keyLight.transform.position.copy(sunPosition);

    // The sun's light is gone before the moon's starts, so the key light
    // changes body with nothing lit and its shadows never jump.
    const moon = this.moon;
    moon.update(this.elevation, this.azimuth);
    if (moon.isKeyLight(this.elevation)) {
      keyLight.transform.position
        .copy(moon.direction)
        .multiplyScalar(sunOrbitDistance);
      keyLight.color.copy(MOON_COLOR);
      keyLight.intensity = moon.intensity * overcastDim;
    }

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
    // Float index 37 = starLod. Zero is the screen answer — a fragment subtends
    // far less than a star — and SkyCubeCapture overwrites it in its own copy
    // of this block, so the live buffer never needs anything else.
    uniformData[37] = 0;
    const wind = this.wind;
    uniformData[38] = wind.upperDirection[0];
    uniformData[39] = wind.upperDirection[1];
    uniformData[40] = this.precipitation;
    uniformData[41] = this.temperature;
    uniformData[42] = 0.0;
    uniformData[43] = wind.cirrusScroll;
    uniformData[44] = wind.cloudDrift[0];
    uniformData[45] = wind.cloudDrift[1];
    uniformData.set(wind.cloudFront, 48);

    // The moon image's mip for the disc's size on screen: projection[5] is
    // 1 / tan(fovY / 2), so a pixel spans about 2 / (projection[5] * height).
    const moonRadius = degToRad(moon.size);
    const pixelAngle = 2 / (camera.projectionMatrix.elements[5] * height);
    this.pixelAngle = pixelAngle;
    const moonPixels = (2 * moonRadius) / pixelAngle;
    uniformData[52] = moon.direction.x;
    uniformData[53] = moon.direction.y;
    uniformData[54] = moon.direction.z;
    uniformData[55] = moonRadius;
    uniformData[56] = moon.nightRadiance;
    uniformData[57] = moon.dayRadiance;
    uniformData[58] = Math.max(0, Math.log2(this.moonTextureSize / moonPixels));

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
      this.temperature,
      camera.transform.position,
      cfwdX,
      cfwdZ
    );

    // The flash flickers on after the strike's flash (LightningFlash); the
    // clouds' glow and the composite follow the flicker.
    const eye = camera.transform.position;
    this.flash.update(
      renderer.delta / 1000,
      strike.flashIntensity,
      this.lightning.strikePosition,
      eye.x,
      eye.y,
      eye.z,
      cfwdX,
      cfwdZ
    );

    // lightningBoost drives cloud ambient flash (float index 42)
    uniformData[42] = this.flash.intensity * 0.6;

    // lightningFlash is read by SkyCompositePass.setupFinalPassUniforms
    this.lightningFlash = this.flash.intensity;

    this.lastCameraPos[0] = camera.transform.position.x;
    this.lastCameraPos[1] = camera.transform.position.y;
    this.lastCameraPos[2] = camera.transform.position.z;

    return uniformData;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void {
    // The whole chain is re-initialised rather than just the pass that asked
    // for it: cloudsPass.init() recreates its render target, and bilateralPass
    // and godRaysPass hold references to that texture which have to be re-bound.
    //
    // requiresRebuild is tested first so the short-circuit covers the case where
    // canvasSizeWatcher has not been created yet.
    if (
      this.requiresRebuild ||
      this.canvasSizeWatcher.hasResized() ||
      renderer.quality.hasChangedSince(this.builtQualityRevision)
    ) {
      this.init(renderer);
    }

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

    // Render cloud shadow map (every N frames), cast from the key light so
    // moonlight is shadowed by cloud too.
    const lightPosition = this.keyLight.transform.position;
    const lightDistance = lightPosition.length() || 1;
    this.cloudShadowRenderer.render(
      device,
      commandEncoder,
      camera.transform.position.x,
      camera.transform.position.z,
      this.cloudiness,
      this.wind.cloudDrift,
      this.wind.cloudFront,
      lightPosition.x / lightDistance,
      lightPosition.y / lightDistance,
      lightPosition.z / lightDistance,
      () => this.gpuTimer.writes('sky-cloud-shadow')
    );

    const sunPosition = this.sunPosition;
    const sunDir = sunPosition.length() || 1;

    // Update temporal state: teleport detection + store prev view-proj for next frame's reprojection
    this.cloudsPass.updateTemporalState(camera, this.viewProjMatrix);

    this.cloudsPass.render(commandEncoder, this.gpuTimer.writes('sky-clouds'));
    this.atmospherePass.render(
      commandEncoder,
      this.gpuTimer.writes('sky-atmosphere')
    );

    const facesCaptured = this.cubeCapture.render(
      device,
      commandEncoder,
      uniformData,
      sunPosition.x / sunDir,
      sunPosition.y / sunDir,
      sunPosition.z / sunDir,
      this.cloudiness,
      this.foginess,
      this.temperature,
      camera.transform.position.y,
      () => this.gpuTimer.writes('sky-cube-capture')
    );

    this.iblPrefilter.render(device, commandEncoder, facesCaptured, () =>
      this.gpuTimer.writes('sky-ibl-prefilter')
    );

    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    // Sync god ray config tunables then render
    this.godRaysPass.config.enabled = this.godRayEnabled;
    this.godRaysPass.config.density = this.godRayDensity;
    this.godRaysPass.config.decay = this.godRayDecay;
    this.godRaysPass.intensityScale = this.godRayIntensity;
    this.godRaysPass.render(renderer, sunPosition, camera, this.upDot, () =>
      this.gpuTimer.writes('sky-god-rays')
    );

    // Bilateral only uses the matrix to reconstruct ray directions, so it
    // gets the camera-centered variant for position-independent precision.
    this.bilateralPass.cameraAltitude = camera.transform.position.y;
    this.bilateralPass.render(
      renderer,
      this.invViewProjCentered.elements,
      this.gpuTimer.writes('sky-bilateral')
    );

    // Blend sub-pass: sky HDR + bilateral HDR → intermediateTarget (no tonemap),
    // which the atmosphere composite then blends over the HDR scene target.
    this.finalPass.cameraAltitude = camera.transform.position.y;
    this.finalPass.renderBlend(renderer);

    // Store bolt for postRender (renders before rain so it sits behind particles)
    const currentStrike = this.lightning.currentStrike;
    this.pendingBoltStrike = currentStrike.boltVisible ? currentStrike : null;

    if (this.precipitation > 0) {
      const { x: wdx, y: wdy } = this.windDirection;
      const baseSpeed = rainWindSpeed(this.windiness);
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
        light: rainLight(this.cloudiness, this.lightningFlashIntensity),
        pixelAngle: this.pixelAngle,
      };
      this.rainPass.simulate(renderer, rainParams, renderer.delta);
      this.pendingRainParams = rainParams;
    } else {
      this.pendingRainParams = null;
    }

    this.finalPass.azimuth = this.azimuth;
    this.finalPass.elevation = this.elevation;
    this.finalPass.cloudiness = this.cloudiness;
    this.finalPass.render(renderer, pass, camera);

    this.gpuTimer.resolve();
  }

  /** Called after the sky compositor is submitted — renders bolt then rain onto the canvas. */
  postRender(renderer: Renderer): void {
    // Under water the view is the water's, not the air's.
    if (renderer.terrainRenderer.underWater.submerged) return;
    if (this.pendingBoltStrike) {
      // Match fog.wgsl's exponential height fog: constant aerial haze plus the
      // ground-hugging layer's density at camera height. The bolt shader only
      // takes a scalar density, and bolt rays climb out of the layer toward the
      // cloud base, so the layer term is scaled down to an average along the path.
      const falloff = 15 + 45 * this.foginess;
      const ceiling = 100 + 700 * this.foginess * this.foginess;
      const layerDensityAtCam =
        0.01 *
        this.foginess *
        this.foginess *
        Math.exp(-Math.max(this.lastCameraPos[1] - ceiling, 0) / falloff);
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
    this.iblPrefilter.dispose();
    this.cubeCapture.dispose();
    this.starfieldRenderer.dispose();
    this.cloudShadowRenderer.dispose();
    this.gpuTimer?.dispose();
    this.bilateralPass.dispose();
    this.godRaysPass.dispose();
    this.rainPass.dispose();
    this.lightningBoltPass.dispose();
    this.finalPass.dispose();
  }
}
