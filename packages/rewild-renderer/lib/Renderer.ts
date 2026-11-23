import { Frustum, Matrix4, WebGPUCoordinateSystem } from 'rewild-common';
import { IVisualComponent } from '../types/interfaces';
import { PerspectiveCamera } from './core/PerspectiveCamera';
import { Transform } from './core/Transform';
import { Camera } from './core/Camera';
import { Geometry } from './geometry/Geometry';
import { IMaterialPass } from './materials/IMaterialPass';
import { IRenderGroup } from '../types/IRenderGroup';
import { Sky } from './core/Sky';
import { TerrainRenderer } from './renderers/terrain/TerrainRenderer';
import { initTerrainTextureArrays } from './renderers/terrain/TerrainTextureArrays';
import { SceneSizeWatcher } from './utils/SceneSizeWatcher';
import { RenderList } from './core/RenderList';
import { RenderLayer } from './core/RenderLayer';
import { Light } from './core/lights/Light';
import { MipMapGenerator } from './textures/MipMapGenerator';
import { SceneCategory } from './materials/IMaterialPass';
import { MetricsRegistry } from './metrics/MetricsRegistry';
import { GpuPassTimer } from './metrics/GpuPassTimer';
import { TextureManager } from './managers/TextureManager';
import { SamplerManager } from './managers/SamplerManager';
import { GeometryManager } from './managers/GeometryManager';
import { MaterialManager } from './managers/MaterialManager';
import { SkinnedModelManager } from './managers/SkinnedModelManager';
import { IMaterialsTemplate } from './managers/types';
import { UIFont, UIIcons, UIRenderer } from 'rewild-gpu-ui';
import { isVisualComponent } from './typeGuards';
import { SceneBVH } from './acceleration/SceneBVH';
import { BVHConfig, DEFAULT_BVH_CONFIG } from './acceleration/BVHConfig';
import { BVHWorkerManager } from './acceleration/BVHWorkerManager';
import { hasWasmSimd, loadRewildWasm } from './wasm/RewildWasm';
import wasmUrl from '../../rewild-wasm/pkg/rewild_wasm_bg.wasm';
import { DirectionalShadowRenderer } from './renderers/shadow/DirectionalShadowRenderer';
import { SpotLightShadowRenderer } from './renderers/shadow/SpotLightShadowRenderer';
import { FrameCompositor } from './post-processes/FrameCompositor';
import { FrameUpscalePass } from './post-processes/FrameUpscalePass';
import { RefractionCapture } from './renderers/water/RefractionCapture';
import { HeatShimmer } from './post-processes/HeatShimmer';
import { PortalLens } from './renderers/portal/PortalLens';
import { PortalSparks } from './renderers/portal/PortalSparks';
import type { PortalPass } from './materials/PortalPass';
import { IFrameEffect } from './post-processes/IFrameEffect';
import { AmbientOcclusion } from './renderers/ao/AmbientOcclusion';
import { QualitySettings } from './utils/QualitySettings';
import { sortFrontToBack } from './utils/frontToBack';

const _projScreenMatrix = new Matrix4();
const _uiViewProjection = new Matrix4();

// Opaque, then water, then transparent: blended passes write no depth, so
// water has to land before them.
const drawRank = (group: IRenderGroup) =>
  group.pass.transparent ? 2 : group.pass.profileCategory === 'water' ? 1 : 0;

// Squared view distance of a group's first mesh, from the modelViewMatrix
// render() fills in before organising the solids.
const viewDistanceSq = (group: IRenderGroup) => {
  const e = group.meshes[0].transform.modelViewMatrix.elements;
  return e[12] * e[12] + e[13] * e[13] + e[14] * e[14];
};

// Water goes nearest chunk first: each chunk writes its depth before it
// shades, so a nearer chunk drawn first hides the water behind it.
const sortOpaqueFirst = (a: IRenderGroup, b: IRenderGroup) => {
  const rank = drawRank(a) - drawRank(b);
  if (rank !== 0 || drawRank(a) !== 1) return rank;
  return viewDistanceSq(a) - viewDistanceSq(b);
};

export class Renderer {
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;

  /**
   * Colour format of the main scene pass. HDR, so shaded values above 1.0
   * survive to the end of the frame rather than being clipped as they are
   * written — physical light units and IBL both depend on that headroom.
   *
   * Only the scene pass renders at this format. The sky composite, overlay,
   * GUI and precipitation passes all draw to the frame target or the swapchain
   * and stay at `presentationFormat`, so any material used in those passes
   * must too.
   */
  sceneColorFormat: GPUTextureFormat = 'rgba16float';

  /**
   * Format of the scene pass's second target, the occludable ambient SSAO
   * scales back (scene-output.wgsl). rg11b10ufloat where the adapter can render
   * to it; the ambient is never negative and needs no alpha.
   */
  sceneIndirectFormat: GPUTextureFormat = 'rgba16float';

  /**
   * App-wide render quality. Every subsystem that scales with quality — sky,
   * clouds, bloom, and materials in future — reads its tier from here. Set
   * `renderer.quality.level` and each one rebuilds on its next frame.
   */
  quality: QualitySettings = new QualitySettings();

  canvas: HTMLCanvasElement;
  sampleCount = 1;

  /**
   * Size of the scene targets, in pixels: the canvas's CSS size times
   * `quality.renderScale`. The canvas itself is sized by the device pixel
   * ratio, so the UI draws sharp. Passes that draw the scene size themselves
   * from these, not from the canvas.
   */
  sceneWidth = 1;
  sceneHeight = 1;

  private context: GPUCanvasContext;
  disposed: boolean;
  /** HDR colour target the scene pass renders into. */
  private sceneColorTexture: GPUTexture | undefined;
  private sceneColorView: GPUTextureView | undefined;
  private sceneIndirectTexture: GPUTexture | undefined;
  private sceneIndirectView: GPUTextureView | undefined;
  /** Bloom + whole-frame tone curve; turns the HDR frame into the displayed image. */
  frameCompositor: FrameCompositor;
  /** The tone-mapped frame, when the scene size differs from the canvas size. */
  private readonly frameUpscale = new FrameUpscalePass();
  private initialized: boolean;
  private autoFrame: boolean;

  public depthTexture: GPUTexture;
  public terrainRenderer: TerrainRenderer;
  textureManager: TextureManager;
  geometryManager: GeometryManager;
  samplerManager: SamplerManager;
  materialManager: MaterialManager;
  skinnedModels: SkinnedModelManager;
  mipmapGenerator: MipMapGenerator;

  // Every performance number the engine publishes, and the only thing the perf
  // panel reads. Disabled until the panel opens, at which point it costs one
  // branch per record call. See MetricsRegistry.
  metrics: MetricsRegistry = new MetricsRegistry();

  // GPU time for the shadow and main scene passes. Terrain is not its own pass —
  // its LOD meshes draw through renderGroupings in the main one — so 'scene'
  // covers the opaque lot. The 'ao' rows are SSAO's three passes. When water is
  // in view, 'refraction' times its copy, and 'water' the pass water and the
  // transparent meshes draw in.
  sceneGpuTimer: GpuPassTimer = new GpuPassTimer(this.metrics, 'gpu/scene');
  uiGpuTimer: GpuPassTimer = new GpuPassTimer(this.metrics, 'gpu/ui');

  /** The opaque scene copied for water to refract, when water is in view. */
  readonly refraction = new RefractionCapture();

  /** Portals updated every frame, in view or not. */
  private readonly portals: PortalPass[] = [];

  /** Heat haze in hot weather; one of the frame effects. */
  readonly heatShimmer = new HeatShimmer();
  /** Drawn over the composited frame each frame, in this order. */
  readonly frameEffects: IFrameEffect[];

  addPortal(portal: PortalPass): void {
    if (!this.portals.includes(portal)) this.portals.push(portal);
  }

  removePortal(portal: PortalPass): void {
    const index = this.portals.indexOf(portal);
    if (index > -1) this.portals.splice(index, 1);
  }

  /** SSAO on the sky ambient, between the opaque scene and water. */
  readonly ambientOcclusion = new AmbientOcclusion();

  // Scene categories held back from every pass, shadows included. Attribution
  // by ablation: hide one and the `scene` row falls by what it was costing.
  // See setSceneCategoryEnabled and IMaterialPass.profileCategory.
  hiddenSceneCategories = new Set<SceneCategory>();

  camera: PerspectiveCamera;
  scene: Transform;
  /** Draws the world UI in the scene and the screen UI over the frame. */
  ui: UIRenderer;
  currentRenderList: RenderList;
  sky: Sky;
  private sceneSizeWatcher: SceneSizeWatcher;
  private renderGroups: IRenderGroup[];
  private overlayRenderGroups: IRenderGroup[];

  lastTime: number;
  delta: number;
  totalDeltaTime: number;

  private onFrameHandler: () => void;
  private pendingScreenshots: ((blob: Blob | null) => void)[] = [];

  /** The camera's view frustum for the frame being rendered, in world
   *  space. Refreshed before anything is culled, whether or not the scene BVH
   *  is doing the culling. */
  frustum = new Frustum();

  /** Optional scene-level BVH for spatial acceleration (frustum culling, raycasting). */
  sceneBVH: SceneBVH | null = null;

  /** When true, sceneBVH.update() is called automatically each frame. */
  sceneBVHAutoUpdate: boolean = false;

  /** Global BVH configuration. Controls auto-compute, async builds, and refit. */
  bvhConfig: BVHConfig;

  /** Shared worker manager for async BVH builds. Created lazily. */
  bvhWorkerManager: BVHWorkerManager | null = null;

  directionalShadowRenderer: DirectionalShadowRenderer;
  spotLightShadowRenderer: SpotLightShadowRenderer;
  /** GPU storage-buffer index of the shadow-casting spot light; -1 when none. Set by Lighting.prepare(). */
  shadowCastingSpotLightIndex: number = -1;

  // Pre-allocated lists for shadow caster collection — bypasses camera frustum culling.
  private _shadowCasters: Transform[] = [];
  private _shadowGroups: IRenderGroup[] = [];

  /** Returns the cloud shadow map texture, or null if not yet initialized. */
  /** True once init() has loaded WASM and the GPU device. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  get cloudShadowMap(): GPUTexture | null {
    return this.sky?.skyRenderer?.cloudShadowRenderer?.shadowMap ?? null;
  }

  /** Returns the cloud shadow world size for UV calculation. */
  get cloudShadowWorldSize(): number {
    return (
      this.sky?.skyRenderer?.cloudShadowRenderer?.config?.worldSize ?? 5000
    );
  }

  /**
   * The atmosphere captured to a cubemap, or null before the sky has
   * initialised. Source texture for the IBL prefilter — see SkyCubeCapture.
   */
  get skyEnvironmentMap(): GPUTexture | null {
    return this.sky?.skyRenderer?.cubeCapture?.cubemap ?? null;
  }

  /**
   * Diffuse ambient from the sky, as irradiance/pi — multiply straight by
   * albedo. Null before the sky has initialised.
   */
  get iblIrradianceMap(): GPUTexture | null {
    return this.sky?.skyRenderer?.iblPrefilter?.irradianceCube ?? null;
  }

  /**
   * Specular ambient from the sky, prefiltered per roughness: mip m holds
   * roughness m / (mipLevelCount - 1). Sample with an explicit level.
   */
  get iblSpecularMap(): GPUTexture | null {
    return this.sky?.skyRenderer?.iblPrefilter?.specularCube ?? null;
  }

  /**
   * Split-sum scale/bias for F0, indexed (NdotV, roughness). Constant for the
   * lifetime of the device — generated once, never updated.
   */
  get iblBrdfLut(): GPUTexture | null {
    return this.sky?.skyRenderer?.iblPrefilter?.brdfLut ?? null;
  }

  /**
   * Global multiplier on the sky's ambient contribution. 1 is the physical
   * answer. 0 removes ambient entirely, which is what separates a
   * direct-lighting bug from an ambient one — `setIblEnabled(false)`.
   *
   * Distinct from `SkyIblPrefilter.enabled`, which stops the cubes being
   * *updated* and leaves whatever they last held still lighting the scene.
   */
  iblIntensity: number = 1;

  /**
   * Material channel to visualise scene-wide instead of shading (#203). 0 is
   * off; the rest mirror DEBUG_CHANNEL_* in shader-lib/material-debug.wgsl.
   *
   * Read by every pass that declares the IBL bindings — the standard material,
   * its instanced variant, and terrain — so one setting covers the whole frame
   * and the same channel can be compared across all three.
   */
  materialDebugChannel: number = 0;
  /**
   * Whether water and wind on the camera's lens show (WaterLens): the blur
   * under water and after surfacing, the wind's blur, the drops and the
   * waterline. Off gives a clear view to edit in.
   */
  lensEffects: boolean = true;

  /** Returns the shared shadow atlas (directional cascades + spot light quadrant), or null if not yet initialized. */
  get shadowAtlas(): GPUTexture | null {
    return this.directionalShadowRenderer?.shadowDepthTexture ?? null;
  }

  /**
   * The HDR target the scene, sky, fog and god rays are all composited into.
   * Read by the bloom pass and by the whole-frame tonemap. Recreated on resize,
   * so anything binding it must rebind then.
   */
  get sceneColorTarget(): GPUTexture {
    return this.sceneColorTexture!;
  }

  /**
   * Colour targets for a pipeline drawn in the scene or water pass, which both
   * carry the indirect target in slot 1. Every opaque pipeline passes
   * `writesIndirect` and returns SceneFragment (scene-output.wgsl), even with
   * no ambient to occlude, or it would keep what a surface behind it wrote.
   * Pipelines drawn in the water pass leave it false.
   */
  sceneTargets(
    color: GPUColorTargetState,
    writesIndirect = false
  ): GPUColorTargetState[] {
    return [
      color,
      {
        format: this.sceneIndirectFormat,
        writeMask: writesIndirect ? GPUColorWrite.ALL : 0,
      },
    ];
  }

  constructor() {
    this.autoFrame = true;
    this.onFrameHandler = this.onFrame.bind(this);
    this.scene = new Transform();
    this.scene.matrixAutoUpdate = false;
    this.sky = new Sky();
    this.terrainRenderer = new TerrainRenderer();
    this.directionalShadowRenderer = new DirectionalShadowRenderer();
    this.spotLightShadowRenderer = new SpotLightShadowRenderer();
    this.frameCompositor = new FrameCompositor();
    // The lightning draws after the lens, so the lens does not smear it.
    this.frameEffects = [
      this.heatShimmer,
      new PortalLens(this.portals),
      new PortalSparks(this.portals),
    ];
    this.renderGroups = [];
    this.overlayRenderGroups = [];

    // Apply default BVH config.
    this.bvhConfig = { ...DEFAULT_BVH_CONFIG };

    if (this.bvhConfig.enableSceneBVH) {
      this.sceneBVH = new SceneBVH(this.scene);
    }
    this.sceneBVHAutoUpdate = this.bvhConfig.sceneBVHAutoUpdate;

    if (this.bvhConfig.asyncBuildThreshold > 0) {
      this.bvhWorkerManager = new BVHWorkerManager();
    }

    this.scene.addChild(this.sky.transform);
  }

  async init(canvas: HTMLCanvasElement, autoFrame = true) {
    this.autoFrame = autoFrame;
    if (this.initialized) return;

    this.disposed = false;
    this.currentRenderList = new RenderList();
    this.initialized = false;
    this.canvas = canvas;

    this.updateSceneSize();
    this.sceneSizeWatcher = new SceneSizeWatcher(this);

    this.camera = new PerspectiveCamera(65, this.sceneWidth / this.sceneHeight);
    this.scene.addChild(this.camera.camera.transform);
    this.camera.camera.transform.position.set(0, 20, 50);
    this.camera.camera.lookAt(0, 0, 0);

    if (!hasWasmSimd())
      throw new Error('need a browser that supports WebAssembly SIMD');
    await loadRewildWasm(wasmUrl);

    const adapter = await navigator.gpu?.requestAdapter();
    const requiredFeatures: GPUFeatureName[] = [];
    if (adapter?.features.has('timestamp-query')) {
      requiredFeatures.push('timestamp-query');
    }
    const indirectFeature = 'rg11b10ufloat-renderable' as GPUFeatureName;
    if (adapter?.features.has(indirectFeature)) {
      requiredFeatures.push(indirectFeature);
      this.sceneIndirectFormat = 'rg11b10ufloat';
    }
    const device = await adapter?.requestDevice({ requiredFeatures });
    if (!device) throw new Error('need a browser that supports WebGPU');

    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('need a browser that supports WebGPU');

    device.lost.then((info) => {
      if (this.disposed) return;
      console.error(`WebGPU device was lost: ${info.message}`);

      // 'reason' will be 'destroyed' if we intentionally destroy the device.
      if (info.reason !== 'destroyed') {
      }
    });

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
      device,
      format: this.presentationFormat,
    });

    this.initialized = true;
    this.context = context;
    this.device = device;

    this.sceneGpuTimer.init(device, [
      'shadow',
      'scene',
      'ao',
      'ao blur',
      'ao resolve',
      'refraction',
      'water surface',
    ]);
    this.declareMetrics();

    this.textureManager = new TextureManager();
    this.samplerManager = new SamplerManager();
    this.geometryManager = new GeometryManager();
    this.materialManager = new MaterialManager();
    this.skinnedModels = new SkinnedModelManager();
    this.mipmapGenerator = new MipMapGenerator();

    const materialsTemplate = (await fetch('/templates/materials.json').then(
      (res) => res.json()
    )) as IMaterialsTemplate;

    await this.samplerManager.initialize(this);
    await this.textureManager.initialize(this, materialsTemplate);
    await initTerrainTextureArrays(this);
    await this.geometryManager.initialize(this);
    await this.materialManager.initialize(this, materialsTemplate);
    await this.terrainRenderer.init(this);
    this.directionalShadowRenderer.init(this);
    this.spotLightShadowRenderer.init(this);
    this.frameCompositor.initToneMap(this);

    this.ui = new UIRenderer(device, this.presentationFormat);
    this.ui.input.attach(canvas);
    this.uiGpuTimer.init(device, ['ui-world', 'ui-blur', 'ui-draw']);
    this.ui.timestampWrites = {
      world: () => this.uiGpuTimer.writes('ui-world'),
      blur: () => this.uiGpuTimer.writes('ui-blur'),
      draw: () => this.uiGpuTimer.writes('ui-draw'),
    };
    // esbuild.js defines the URLs, with a hash of each atlas in its name.
    const [font, icons] = await Promise.all([
      UIFont.load(device, process.env.UI_FONT_URL!),
      UIIcons.load(device, process.env.UI_ICONS_URL!),
    ]);
    this.ui.font = font;
    this.ui.icons = icons;

    this.lastTime = performance.now();
    this.delta = 0;
    this.totalDeltaTime = 0;

    this.resizeRenderTargets();
    if (this.autoFrame) requestAnimationFrame(this.onFrameHandler);
  }

  onFrame() {
    if (this.disposed) return;

    this.sky.update(this, this.camera.camera);
    for (let i = 0; i < this.portals.length; i++) this.portals[i].update(this);
    this.metrics.begin('cpu.terrain');
    this.terrainRenderer.update(this, this.camera.camera);
    this.metrics.end('cpu.terrain');

    this.render();

    if (this.autoFrame) requestAnimationFrame(this.onFrameHandler);
  }

  dispose() {
    this.terrainRenderer.dispose();
    this.directionalShadowRenderer.dispose();
    this.spotLightShadowRenderer.dispose();
    this.sceneGpuTimer.dispose();
    this.uiGpuTimer.dispose();
    this.refraction.dispose();
    for (const effect of this.frameEffects) effect.dispose();
    this.ambientOcclusion.dispose();
    this.frameCompositor.dispose();
    this.frameUpscale.dispose();
    this.disposed = true;
    this.initialized = false;
    this.sceneColorTexture?.destroy();
    this.sceneIndirectTexture?.destroy();
    this.depthTexture?.destroy();
    this.device.destroy();
    this.renderGroups.length = 0; // Clear the render groups
    this.overlayRenderGroups.length = 0;
    this.currentRenderList.reset();
    this.sceneBVH?.dispose();
    this.sceneBVH = null;
    this.bvhWorkerManager?.dispose();
    this.bvhWorkerManager = null;
    this.sky.dispose();
    this.textureManager.dispose();
    this.samplerManager.dispose();
    this.skinnedModels.dispose();
    this.geometryManager.dispose();
    this.materialManager.dispose();
    this.geometryManager.dispose();
    this.ui.font?.dispose();
    this.ui.icons?.dispose();
    this.ui.dispose();
  }

  /**
   * Walk the render groups and refit any per-geometry BVHs whose
   * underlying vertex data has been modified (bvhNeedsUpdate === true).
   */
  private refitDirtyGeometryBVHs(): void {
    for (const group of this.renderGroups) {
      const geom = group.geometry;
      if (geom.bvhNeedsUpdate && geom.bvh && geom.bvh.isReady) {
        geom.bvh.refit();
        geom.bvhNeedsUpdate = false;
      }
    }
  }

  /** Sets `sceneWidth` and `sceneHeight` from the canvas's CSS size and the render scale. */
  private updateSceneSize() {
    const canvas = this.canvas;
    const scale = this.quality.renderScale;
    this.sceneWidth = Math.max(
      1,
      Math.round((canvas.clientWidth || canvas.width) * scale)
    );
    this.sceneHeight = Math.max(
      1,
      Math.round((canvas.clientHeight || canvas.height) * scale)
    );
  }

  /**
   * Where the tone map, rain, lightning and overlays draw: the frame texture
   * when the scene is upscaled to the canvas, else the swapchain.
   */
  get frameView(): GPUTextureView {
    return this.frameUpscale.view ?? this.getCurrentTextureView();
  }

  private get upscaling(): boolean {
    return (
      this.sceneWidth !== this.canvas.width ||
      this.sceneHeight !== this.canvas.height
    );
  }

  resizeRenderTargets() {
    const device = this.device;

    const currentWidth = this.sceneWidth;
    const currentHeight = this.sceneHeight;

    if (this.sceneColorTexture !== undefined) {
      // Destroy the previous render target
      this.sceneColorTexture.destroy();
    }

    const canvas = this.canvas;
    this.camera.aspect =
      canvas.clientWidth && canvas.clientHeight
        ? canvas.clientWidth / canvas.clientHeight
        : currentWidth / currentHeight;
    this.camera.updateProjectionMatrix();

    // HDR colour target for the scene pass, at the scene size. TEXTURE_BINDING
    // is required so the output pass can read it back when transferring to the
    // swapchain.
    const sceneColorTexture = device.createTexture({
      label: 'scene-color-hdr',
      size: [currentWidth, currentHeight],
      sampleCount: this.sampleCount,
      format: this.sceneColorFormat,
      // COPY_SRC: the water lens copies the composited frame to blur it.
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    this.sceneColorTexture = sceneColorTexture;
    this.sceneColorView = sceneColorTexture.createView();

    this.sceneIndirectTexture?.destroy();
    this.sceneIndirectTexture = device.createTexture({
      label: 'scene-indirect',
      size: [currentWidth, currentHeight],
      sampleCount: this.sampleCount,
      format: this.sceneIndirectFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.sceneIndirectView = this.sceneIndirectTexture.createView();

    if (this.depthTexture) this.depthTexture.destroy();

    this.depthTexture = device.createTexture({
      size: [currentWidth, currentHeight],
      label: 'depth-texture-writable',
      format: 'depth24plus',
      sampleCount: this.sampleCount,
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    // Bloom derives its target sizes from the scene size and reads the scene target,
    // so it is rebuilt here rather than once at startup. The tone map pipeline is
    // resolution-independent and rebinds itself when it sees a new texture.
    this.frameCompositor.init(this);
  }

  // TODO: Will come back later to flesh this out
  projectObject(
    transform: Transform,
    camera: Camera,
    layerOverride?: RenderLayer
  ): void {
    if (transform.visible === false) return;

    const layer = layerOverride ?? transform.renderLayer;

    if (layer === RenderLayer.Overlay) {
      this.currentRenderList.overlay.push(transform);
    } else {
      this.currentRenderList.solids.push(transform);
    }

    if (transform.component instanceof Light) {
      this.currentRenderList.lights.push(transform.component);
    }

    // Children inherit the overlay layer from their ancestor
    const childOverride =
      layer === RenderLayer.Overlay ? RenderLayer.Overlay : undefined;

    for (let i = 0, l = transform.children.length; i < l; i++)
      this.projectObject(transform.children[i], camera, childOverride);
  }

  /**
   * Lightweight scene traversal that only collects lights and overlay
   * transforms. Used when the scene BVH handles solid-object culling.
   */
  private collectLightsAndOverlays(
    transform: Transform,
    isOverlay: boolean = false
  ): void {
    if (transform.visible === false) return;

    const overlay = isOverlay || transform.renderLayer === RenderLayer.Overlay;

    if (overlay) {
      this.currentRenderList.overlay.push(transform);
    }

    if (transform.component instanceof Light) {
      this.currentRenderList.lights.push(transform.component);
    }

    for (let i = 0, l = transform.children.length; i < l; i++) {
      this.collectLightsAndOverlays(transform.children[i], overlay);
    }
  }

  private collectShadowCasters(
    transform: Transform,
    target: Transform[]
  ): void {
    if (transform.visible === false) return;
    if (
      transform.component &&
      isVisualComponent(transform.component) &&
      transform.component.castShadow !== false
    ) {
      target.push(transform);
    }
    for (let i = 0, l = transform.children.length; i < l; i++) {
      this.collectShadowCasters(transform.children[i], target);
    }
  }

  organizeVisuals(
    transforms: Transform[],
    target: IRenderGroup[],
    frontToBack = false
  ) {
    // Organize all meshes so that they are grouped by material as well as geometry
    // This is done to minimize the number of draw calls

    target.length = 0; // Clear the render list

    let transform: Transform | null;
    let geometry: Geometry | null;
    let material: IMaterialPass | null;
    let mesh: IVisualComponent;

    for (let i: i32 = 0, l: i32 = transforms.length; i < l; i++) {
      transform = transforms[i];

      const component = transform.component;

      if (component && isVisualComponent(component)) {
        mesh = component;

        if (mesh.visible === false) continue;

        geometry = mesh.geometry;
        material = mesh.material;

        const listItem = target.find(
          (item) => item.geometry === geometry && item.pass === material
        );
        if (listItem) {
          listItem.meshes.push(mesh);
        } else {
          target.push({
            geometry,
            meshes: [mesh],
            pass: material,
          });
        }
      }
    }

    target.sort(sortOpaqueFirst);

    if (frontToBack) {
      let opaqueEnd = 0;
      while (opaqueEnd < target.length && drawRank(target[opaqueEnd]) === 0)
        opaqueEnd++;
      sortFrontToBack(
        target,
        0,
        opaqueEnd,
        this.camera.camera.transform.matrixWorld.elements
      );
    }

    return target;
  }

  // Drops the groups of hidden scene categories, so an ablation reaches the
  // passes that do not draw through renderGroupings.
  private removeHiddenCategories(groups: IRenderGroup[]): void {
    const hidden = this.hiddenSceneCategories;
    if (hidden.size === 0) return;
    let kept = 0;
    for (let i = 0; i < groups.length; i++)
      if (!hidden.has(groups[i].pass.profileCategory ?? 'opaque'))
        groups[kept++] = groups[i];
    groups.length = kept;
  }

  renderGroupings(
    renderGroup: IRenderGroup[],
    pass: GPURenderPassEncoder,
    camera: Camera,
    from = 0,
    to = renderGroup.length
  ) {
    const hidden = this.hiddenSceneCategories;
    for (let i = from; i < to; i++) {
      const item = renderGroup[i];
      if (hidden.size > 0 && hidden.has(item.pass.profileCategory ?? 'opaque'))
        continue;

      if (item.geometry.requiresBuild)
        item.geometry.build(
          this.device,
          this.bvhConfig,
          this.bvhWorkerManager ?? undefined
        );
      if (item.pass.requiresRebuild) item.pass.init(this);

      item.pass.render(this, pass, camera, item.meshes, item.geometry);
    }
  }

  /**
   * Names and labels for everything render() publishes.
   *
   * Declared up front rather than on first use so the panel shows a stable row
   * order from the first frame, instead of rows appearing as each phase first
   * runs.
   */
  private declareMetrics(): void {
    const m = this.metrics;
    m.declare('frame.wall', { label: 'frame', group: 'frame', order: 0 });
    m.declare('frame.cpu', { label: 'cpu (render)', group: 'frame', order: 1 });

    m.declare('cpu.scenegraph', {
      label: 'scene graph',
      group: 'cpu',
      order: 0,
    });
    m.declare('cpu.cull', { label: 'cull + collect', group: 'cpu', order: 1 });
    m.declare('cpu.organize', {
      label: 'organize visuals',
      group: 'cpu',
      order: 2,
    });
    m.declare('cpu.encode', {
      label: 'encode + submit',
      group: 'cpu',
      order: 3,
    });
    m.declare('cpu.shadowcast', {
      label: 'shadow casters (in encode)',
      group: 'cpu',
      order: 4,
    });
    m.declare('cpu.terrain', {
      label: 'terrain update',
      group: 'cpu',
      order: 5,
    });
    m.declare('cpu.farmap', {
      label: 'far map rebuild (in terrain)',
      group: 'cpu',
      order: 6,
    });
    m.declare('cpu.pose', {
      label: 'creature poses',
      group: 'cpu',
      order: 7,
    });
    m.declare('cpu.uilayout', {
      label: 'ui layout (in encode)',
      group: 'cpu',
      order: 8,
    });
    m.declare('cpu.uiwrite', {
      label: 'ui stream (in encode)',
      group: 'cpu',
      order: 9,
    });

    const count = 'count' as const;
    m.declare('counts.drawgroups', {
      label: 'draw groups',
      group: 'counts',
      kind: count,
      order: 0,
    });
    m.declare('counts.terrain', {
      label: 'terrain meshes',
      group: 'counts',
      kind: count,
      order: 3,
    });
    m.declare('counts.scatter', {
      label: 'scatter meshes',
      group: 'counts',
      kind: count,
      order: 4,
    });
    m.declare('counts.water', {
      label: 'water meshes',
      group: 'counts',
      kind: count,
      order: 5,
    });
    m.declare('counts.opaque', {
      label: 'other meshes',
      group: 'counts',
      kind: count,
      order: 6,
    });
    m.declare('counts.solids', {
      label: 'visible solids',
      group: 'counts',
      kind: count,
      order: 1,
    });
    m.declare('counts.shadowcasters', {
      label: 'shadow casters',
      group: 'counts',
      kind: count,
      order: 2,
    });
    m.declare('counts.creatures', {
      label: 'creatures',
      group: 'counts',
      kind: count,
      order: 7,
    });
    m.declare('counts.posed', {
      label: 'creatures posed',
      group: 'counts',
      kind: count,
      order: 8,
    });
    m.declare('counts.uinodes', {
      label: 'ui nodes',
      group: 'counts',
      kind: count,
      order: 9,
    });
    m.declare('counts.uiprimitives', {
      label: 'ui primitives',
      group: 'counts',
      kind: count,
      order: 10,
    });
    m.declare('counts.uidraws', {
      label: 'ui draw calls',
      group: 'counts',
      kind: count,
      order: 11,
    });
  }

  /**
   * What the last UI render cost. Layout and stream writes run only on frames
   * where the UI changed, so they are recorded only then and the panel shows
   * how often they run.
   */
  private recordUIStats(): void {
    const m = this.metrics;
    const stats = this.ui.stats;
    if (stats.layouts > 0) m.record('cpu.uilayout', stats.layoutTime);
    if (stats.writes > 0) m.record('cpu.uiwrite', stats.writeTime);
    m.record('counts.uinodes', stats.nodes);
    m.record('counts.uiprimitives', stats.primitives);
    m.record('counts.uidraws', stats.drawCalls);
  }

  /**
   * Mesh count per scene category, so the panel shows what the scene pass is
   * made of. The pass cannot be timed per category, only ablated, and these
   * counts say which category is worth ablating first.
   */
  private recordCategoryCounts(renderList: IRenderGroup[]): void {
    let terrain = 0;
    let scatter = 0;
    let water = 0;
    let opaque = 0;

    for (const item of renderList) {
      const meshes = item.meshes.length;
      const category = item.pass.profileCategory ?? 'opaque';
      if (category === 'terrain') terrain += meshes;
      else if (category === 'scatter') scatter += meshes;
      else if (category === 'water') water += meshes;
      else opaque += meshes;
    }

    const m = this.metrics;
    m.record('counts.terrain', terrain);
    m.record('counts.scatter', scatter);
    m.record('counts.water', water);
    m.record('counts.opaque', opaque);
  }

  /**
   * PNG of the next rendered frame without overlays, UI or debug viewers.
   * toBlob copies the canvas as of the work submitted so far, so it is called
   * after the scene passes and before the overlay and GUI passes are submitted.
   */
  captureScreenshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.pendingScreenshots.push(resolve));
  }

  private flushScreenshots(): void {
    const pending = this.pendingScreenshots;
    if (pending.length === 0) return;
    const resolvers = pending.slice();
    pending.length = 0;
    this.canvas.toBlob((blob) => {
      for (const resolve of resolvers) resolve(blob);
    }, 'image/png');
  }

  getCurrentTextureView(): GPUTextureView {
    return this.context.getCurrentTexture().createView();
  }

  hasWebGPU() {
    if (!navigator.gpu) {
      return false;
    } else {
      return true;
    }
  }

  render() {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.delta = deltaTime;
    this.totalDeltaTime += deltaTime;
    this.lastTime = currentTime;

    const metrics = this.metrics;
    metrics.beginFrame();
    metrics.record('frame.wall', deltaTime);
    metrics.begin('frame.cpu');
    const pCamera = this.camera;

    metrics.begin('cpu.pose');
    const eye = pCamera.camera.transform.matrixWorld.elements;
    this.skinnedModels.update(deltaTime / 1000, eye[12], eye[13], eye[14]);
    metrics.end('cpu.pose');
    if (metrics.enabled) {
      metrics.record('counts.creatures', this.skinnedModels.instanceCount);
      metrics.record('counts.posed', this.skinnedModels.posed);
    }

    metrics.begin('cpu.scenegraph');

    // update scene graph
    this.scene.updateMatrixWorld();

    // update camera matrices and frustum
    if (pCamera.camera.transform.parent === null)
      pCamera.camera.transform.updateMatrixWorld();

    // Auto-update scene BVH if enabled
    if (this.sceneBVHAutoUpdate && this.sceneBVH) this.sceneBVH.update();

    // Auto-refit per-geometry BVHs when vertices have been modified.
    if (this.bvhConfig.autoRefitGeometryBVH) {
      this.refitDirtyGeometryBVHs();
    }

    metrics.end('cpu.scenegraph');
    metrics.begin('cpu.cull');

    // Clear the render list before projecting objects
    this.currentRenderList.reset();

    _projScreenMatrix.multiplyMatrices(
      pCamera.camera.projectionMatrix,
      pCamera.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(
      _projScreenMatrix,
      WebGPUCoordinateSystem
    );

    // Project objects in the scene. Collect those that are to be rendered.
    // When a scene BVH is available, use frustum culling to avoid
    // visiting the entire scene graph.
    if (this.sceneBVH) {
      // BVH frustum cull returns only visible visual-component transforms.
      this.sceneBVH.frustumCull(this.frustum, this.currentRenderList.solids);

      // Lights and overlays are not tracked by the scene BVH, so collect
      // them with the traditional traversal.
      this.collectLightsAndOverlays(this.scene);
    } else {
      this.projectObject(this.scene, pCamera.camera);
    }

    metrics.end('cpu.cull');
    metrics.begin('cpu.organize');

    let transform: Transform | null;
    const solids = this.currentRenderList.solids;
    for (let i: i32 = 0, l: i32 = solids.length; i < l; i++) {
      transform = solids[i];
      if (!transform) return;

      transform.modelViewMatrix.multiplyMatrices(
        pCamera.camera.matrixWorldInverse,
        transform.matrixWorld
      );

      transform.normalMatrix.getNormalMatrix(transform.modelViewMatrix);
    }

    const renderList = this.organizeVisuals(
      this.currentRenderList.solids,
      this.renderGroups,
      true
    );

    // Compute modelViewMatrix for overlay transforms
    const overlayTransforms = this.currentRenderList.overlay;
    for (let i: i32 = 0, l: i32 = overlayTransforms.length; i < l; i++) {
      transform = overlayTransforms[i];
      if (!transform) continue;

      transform.modelViewMatrix.multiplyMatrices(
        pCamera.camera.matrixWorldInverse,
        transform.matrixWorld
      );

      transform.normalMatrix.getNormalMatrix(transform.modelViewMatrix);
    }

    const overlayRenderList = this.organizeVisuals(
      overlayTransforms,
      this.overlayRenderGroups
    );

    metrics.end('cpu.organize');
    if (metrics.enabled) this.recordCategoryCounts(renderList);
    metrics.record('counts.solids', solids.length);
    metrics.record(
      'counts.drawgroups',
      renderList.length + overlayRenderList.length
    );
    metrics.begin('cpu.encode');

    // The canvas or the render scale may have changed since the last frame.
    this.updateSceneSize();
    if (this.sceneSizeWatcher.hasResized()) {
      this.resizeRenderTargets();
    }
    this.frameUpscale.prepare(this, this.upscaling);

    const device = this.device;
    const context = this.context;
    const sceneColorView = this.sceneColorView;

    if (sceneColorView) {
      const encoder = device.createCommandEncoder({
        label: 'main pass encoder',
      });

      // Directional shadow pass — depth-only, runs before the main color pass.
      // Shadow casters are collected from the full scene, not the camera-culled renderList,
      // so objects outside the camera frustum still cast visible shadows.
      metrics.begin('cpu.shadowcast');
      this._shadowCasters.length = 0;
      this.collectShadowCasters(this.scene, this._shadowCasters);
      const shadowRenderList = this.organizeVisuals(
        this._shadowCasters,
        this._shadowGroups
      );
      this.removeHiddenCategories(shadowRenderList);
      metrics.end('cpu.shadowcast');
      metrics.record('counts.shadowcasters', this._shadowCasters.length);
      this.directionalShadowRenderer.render(
        encoder,
        shadowRenderList,
        this.camera,
        this
      );
      this.spotLightShadowRenderer.render(
        encoder,
        shadowRenderList,
        this.camera,
        this
      );

      // The scene pass renders to the HDR target rather than the swapchain, so
      // shaded values above 1.0 are preserved instead of clipped on write.
      // The frame compositor tonemaps it to the swapchain at the end of the frame.
      const pass = encoder.beginRenderPass({
        label: 'scene pass',
        colorAttachments: [
          {
            view: sceneColorView,
            clearValue: [0.0, 0.0, 0.0, 1.0],
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            view: this.sceneIndirectView!,
            clearValue: [0.0, 0.0, 0.0, 0.0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
        timestampWrites: this.sceneGpuTimer.writes('scene'),
      });

      const camera = this.camera;

      this.terrainRenderer.render(this, pass, camera.camera);

      // The scene pass ends after the opaque groups, so SSAO occludes them
      // alone. Water refracts the opaque scene, so when any is in view it is
      // copied next, and water and the transparent groups draw over it in a
      // pass of their own.
      let opaqueEnd = 0;
      while (
        opaqueEnd < renderList.length &&
        drawRank(renderList[opaqueEnd]) === 0
      )
        opaqueEnd++;
      const hasWater =
        opaqueEnd < renderList.length && drawRank(renderList[opaqueEnd]) === 1;

      this.renderGroupings(renderList, pass, camera.camera, 0, opaqueEnd);
      pass.end();

      this.ambientOcclusion.render(
        this,
        encoder,
        camera.camera,
        this.depthTexture,
        this.sceneIndirectTexture!,
        sceneColorView
      );

      if (hasWater) {
        this.refraction.capture(
          device,
          encoder,
          this.sceneColorTexture!,
          this.depthTexture,
          camera.camera,
          this.sceneGpuTimer.writes('refraction')
        );
      }

      if (opaqueEnd < renderList.length) {
        const waterPass = encoder.beginRenderPass({
          label: 'water pass',
          colorAttachments: [
            { view: sceneColorView, loadOp: 'load', storeOp: 'store' },
            {
              view: this.sceneIndirectView!,
              loadOp: 'clear',
              storeOp: 'discard',
            },
          ],
          depthStencilAttachment: {
            view: this.depthTexture.createView(),
            depthLoadOp: 'load',
            depthStoreOp: 'store',
          },
          timestampWrites: this.sceneGpuTimer.writes('water surface'),
        });
        this.renderGroupings(
          renderList,
          waterPass,
          camera.camera,
          opaqueEnd,
          renderList.length
        );
        waterPass.end();
      }
      device.queue.submit([encoder.finish()]);

      // Resolve the scene-pass GPU timestamps (no-op unless the panel is open).
      this.sceneGpuTimer.resolve();

      // Create a new encoder for the post-processing pass
      const postProcessingEncoder = device.createCommandEncoder({
        label: 'post-processing encoder',
      });

      // Light shafts under water march at half resolution; the composite's
      // pass adds them over the water's fog.
      this.terrainRenderer.renderLightShafts(this, postProcessingEncoder);

      // The atmosphere composite blends sky, clouds, fog and god rays over the
      // scene *in HDR*, loading what the scene pass already wrote. Both sides of
      // its src-alpha blend are now radiance on the same scale, so the result is
      // a single unified HDR frame rather than tonemapped sky over untonemapped
      // terrain.
      const postProcessingPass = postProcessingEncoder.beginRenderPass({
        label: 'atmosphere composite pass',
        colorAttachments: [
          {
            view: sceneColorView,
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });

      // Ensure sky matrices are up-to-date (its transform is not
      // part of the solids list when BVH culling is active).
      this.sky.transform.modelViewMatrix.multiplyMatrices(
        camera.camera.matrixWorldInverse,
        this.sky.transform.matrixWorld
      );
      this.sky.render(this, postProcessingPass, camera.camera);
      this.terrainRenderer.renderUnderWaterFog(this, postProcessingPass);
      postProcessingPass.end();

      // Spray and marine snow fog themselves, so they draw over the composite,
      // not under it.
      this.terrainRenderer.renderSeaSpray(
        this,
        postProcessingEncoder,
        sceneColorView
      );
      this.terrainRenderer.renderMarineSnow(
        this,
        postProcessingEncoder,
        sceneColorView,
        camera.camera
      );

      device.queue.submit([postProcessingEncoder.finish()]);

      for (let i = 0; i < this.frameEffects.length; i++)
        this.frameEffects[i].render(
          this,
          camera.camera,
          this.sceneColorTexture!,
          sceneColorView
        );

      // Water on the lens blurs and bends the composited frame, so bloom and
      // the tonemap see it as the eye does.
      this.terrainRenderer.renderLens(
        this,
        camera.camera,
        this.sceneColorTexture!,
        sceneColorView
      );

      // Bloom + whole-frame tonemap. Runs after the composite has been submitted
      // because bloom reads the target that pass writes. This is the only place
      // HDR radiance becomes displayable colour.
      const frameView = this.frameView;
      this.frameCompositor.render(this, frameView);

      // World UI draws in the tone-mapped frame, so its colours match the
      // screen UI. It tests the scene depth, so terrain can hide it. Its glass
      // reads the last frame's blur, which the screen UI makes below.
      const worldUIEncoder = device.createCommandEncoder({
        label: 'ui world encoder',
      });
      this.ui.renderWorld(worldUIEncoder, {
        view: frameView,
        depthView: this.depthTexture.createView(),
        width: this.sceneWidth,
        height: this.sceneHeight,
        viewProjection: _uiViewProjection.multiplyMatrices(
          camera.camera.projectionMatrix,
          camera.camera.matrixWorldInverse
        ),
      });
      device.queue.submit([worldUIEncoder.finish()]);

      // Render precipitation onto the tone-mapped frame so particles are
      // visible against both terrain and sky (not gated through fog alpha).
      this.sky.postRender(this);

      // A screenshot reads the canvas, so it needs the frame on it before the
      // overlays draw.
      if (this.pendingScreenshots.length > 0 && this.frameUpscale.view) {
        this.frameUpscale.render(this, this.getCurrentTextureView());
      }
      this.flushScreenshots();

      // Overlay pass: renders on top of scene + sky with depth cleared
      if (overlayRenderList.length > 0) {
        const overlayEncoder = device.createCommandEncoder({
          label: 'overlay pass encoder',
        });

        const overlayPass = overlayEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: frameView,
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
          depthStencilAttachment: {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'load',
            depthStoreOp: 'store',
          },
        });

        this.renderGroupings(overlayRenderList, overlayPass, camera.camera);
        overlayPass.end();
        device.queue.submit([overlayEncoder.finish()]);
      }

      if (this.frameUpscale.view) {
        this.frameUpscale.render(this, this.getCurrentTextureView());
      }

      // The UI draws over the finished frame. The canvas may be sized at a
      // ratio to its CSS size, and UI layout works in CSS pixels.
      const canvas = this.canvas;
      const uiEncoder = device.createCommandEncoder({ label: 'ui encoder' });
      // Glass blurs the HDR scene, with the same exposure as the tone map.
      this.ui.backdrop = {
        texture: this.sceneColorTarget,
        exposure: camera.camera.exposure,
      };
      this.ui.render(uiEncoder, context.getCurrentTexture().createView(), {
        width: canvas.width,
        height: canvas.height,
        pixelRatio: canvas.clientWidth ? canvas.width / canvas.clientWidth : 1,
      });
      device.queue.submit([uiEncoder.finish()]);
      this.uiGpuTimer.resolve();
      this.recordUIStats();

      // Shadow debug atlas viewer — rendered on top of everything when active.
      this.directionalShadowRenderer.debugRenderer.render(this);

      // Captured sky cubemap viewer — likewise inert unless switched on.
      this.sky.skyRenderer.cubeDebugRenderer.render(this);

      this.ambientOcclusion.renderDebug(this);
    }

    metrics.end('cpu.encode');
    metrics.end('frame.cpu');
  }
}
