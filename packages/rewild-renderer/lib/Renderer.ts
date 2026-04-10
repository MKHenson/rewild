import { Frustum, Matrix4, WebGPUCoordinateSystem } from 'rewild-common';
import { IVisualComponent, IRenderable } from '../types/interfaces';
import { PerspectiveCamera } from './core/PerspectiveCamera';
import { Transform } from './core/Transform';
import { Camera } from './core/Camera';
import { CubeRenderer } from './renderables.ts/CubeRenderer';
import { Geometry } from './geometry/Geometry';
import { IMaterialPass } from './materials/IMaterialPass';
import { IRenderGroup } from '../types/IRenderGroup';
import { AtmosphereSkybox } from './core/AtmosphereSkybox';
import { TerrainRenderer } from './renderers/terrain/TerrainRenderer';
import { TrackballController } from './input/TrackballController';
import { CanvasSizeWatcher } from './utils/CanvasSizeWatcher';
import { RenderList } from './core/RenderList';
import { RenderLayer } from './core/RenderLayer';
import { Light } from './core/lights/Light';
import { MipMapGenerator } from './textures/MipMapGenerator';
import { TextureManager } from './managers/TextureManager';
import { SamplerManager } from './managers/SamplerManager';
import { GeometryManager } from './managers/GeometryManager';
import { MaterialManager } from './managers/MaterialManager';
import { IController } from './input/IController';
import { IMaterialsTemplate } from './managers/types';
import { GuiManager } from './managers/GuiManager';
import { UIElement } from './core/UIElement';
import { FontManager } from './managers/FontManager';
import { IUIElementPass } from './materials/IUIElementPass';
import { isVisualComponent } from './typeGuards';
import { SceneBVH } from './acceleration/SceneBVH';
import { BVHConfig, DEFAULT_BVH_CONFIG } from './acceleration/BVHConfig';
import { BVHWorkerManager } from './acceleration/BVHWorkerManager';

const _projScreenMatrix = new Matrix4();
const _frustum = new Frustum();

export class Renderer {
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  sampleCount = 1;

  private context: GPUCanvasContext;
  private renderables: IRenderable[];
  disposed: boolean;
  private renderTargetView: GPUTextureView | undefined;
  private renderTarget: GPUTexture | undefined;
  private initialized: boolean;
  private autoFrame: boolean;

  public depthTexture: GPUTexture;
  public terrainRenderer: TerrainRenderer;
  textureManager: TextureManager;
  geometryManager: GeometryManager;
  samplerManager: SamplerManager;
  fontManager: FontManager;
  guiManager: GuiManager;
  materialManager: MaterialManager;
  mipmapGenerator: MipMapGenerator;

  perspectiveCam: PerspectiveCamera;
  scene: Transform;
  ui: Transform;
  currentRenderList: RenderList;
  atmosphere: AtmosphereSkybox;
  camController: IController;
  private canvasSizeWatcher: CanvasSizeWatcher;
  private renderGroups: IRenderGroup[];
  private overlayRenderGroups: IRenderGroup[];

  lastTime: number;
  delta: number;
  totalDeltaTime: number;

  private onFrameHandler: () => void;
  private uiVisibleElements: UIElement[] = [];
  private uiElementsByMaterial = new Map<IMaterialPass, UIElement[]>();
  private uiInstanceCounters = new Map<IMaterialPass, number>();

  /** Optional scene-level BVH for spatial acceleration (frustum culling, raycasting). */
  sceneBVH: SceneBVH | null = null;

  /** When true, sceneBVH.update() is called automatically each frame. */
  sceneBVHAutoUpdate: boolean = false;

  /** Global BVH configuration. Controls auto-compute, async builds, and refit. */
  bvhConfig: BVHConfig;

  /** Shared worker manager for async BVH builds. Created lazily. */
  bvhWorkerManager: BVHWorkerManager | null = null;

  constructor() {
    this.autoFrame = true;
    this.onFrameHandler = this.onFrame.bind(this);
    this.scene = new Transform();
    this.scene.matrixAutoUpdate = false;
    this.ui = new Transform();
    this.ui.matrixAutoUpdate = false;
    this.atmosphere = new AtmosphereSkybox();
    this.terrainRenderer = new TerrainRenderer();
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

    this.scene.addChild(this.atmosphere.transform);
  }

  async init(canvas: HTMLCanvasElement, autoFrame = true) {
    this.autoFrame = autoFrame;
    if (this.initialized) return;

    this.disposed = false;
    this.currentRenderList = new RenderList();
    this.initialized = false;
    this.canvas = canvas;
    this.renderables = [];

    this.canvasSizeWatcher = new CanvasSizeWatcher(canvas);

    this.perspectiveCam = new PerspectiveCamera(
      65,
      canvas.width / canvas.height
    );
    this.scene.addChild(this.perspectiveCam.camera.transform);
    this.perspectiveCam.camera.transform.position.set(0, 0, 5);
    this.perspectiveCam.camera.lookAt(0, 0, 0);

    this.camController = new TrackballController(this.perspectiveCam, canvas);

    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
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

    this.textureManager = new TextureManager();
    this.samplerManager = new SamplerManager();
    this.fontManager = new FontManager();
    this.geometryManager = new GeometryManager();
    this.materialManager = new MaterialManager();
    this.mipmapGenerator = new MipMapGenerator();
    this.guiManager = new GuiManager();

    const materialsTemplate = (await fetch('/templates/materials.json').then(
      (res) => res.json()
    )) as IMaterialsTemplate;

    await this.samplerManager.initialize(this);
    await this.fontManager.initialize(this);
    await this.textureManager.initialize(this, materialsTemplate);
    await this.geometryManager.initialize(this);
    await this.materialManager.initialize(this, materialsTemplate);
    await this.terrainRenderer.init(this);

    this.renderables = await Promise.all(
      [new CubeRenderer()].map((renderable) => renderable.initialize(this))
    );

    this.guiManager.initialize(this);

    const element = this.guiManager.createElement(
      this.materialManager.get('ui-material')
    );
    const element2 = this.guiManager.createElement(
      this.materialManager.get('ui-material')
    );
    this.ui.addChild(element.transform);

    element.x = 0.3;
    element.y = 0.2;
    element.percentageBasedCalculation = true;
    element.width = 0.3;
    element.height = 0.1;
    element.borderRadius = 10;
    element.backgroundColor.setRGB(0.3, 0.3, 0.3);
    element.text = 'Hello, World!';

    element2.x = 0.5;
    element2.y = 0;
    element2.percentageBasedCalculation = true;
    element2.width = 0.5;
    element2.height = 1;
    element2.borderRadius = 10;
    element2.backgroundColorAlpha = 1;
    element2.backgroundColor.setRGB(1, 0, 0);
    element2.text =
      'This is a vertical text element. Its a child.It supports multiple lines. And word wrap if enabled in the text options.';
    element.transform.addChild(element2.transform);

    element.dispatcher.add((e) => {
      if (e.type === 'click') {
        console.log('Clicked element 1:', e.target.transform.id);
      }
    });

    element2.dispatcher.add((e) => {
      if (e.type === 'click') {
        e.stopPropagation(); // Stop the event from bubbling up to the parent element
        console.log('Clicked element 2:', e.target.transform.id);
      } else if (e.type === 'mouseenter') {
        element2.backgroundColor.setRGB(0.8, 0.0, 0);
      } else if (e.type === 'mouseleave') {
        element2.backgroundColor.setRGB(1, 0.0, 0.0);
      } else if (e.type === 'mousedown') {
        element2.backgroundColor.setRGB(0.5, 0.0, 0);
      } else if (e.type === 'mouseup') {
        element2.backgroundColor.setRGB(0.8, 0.0, 0);
      }
    });

    this.lastTime = performance.now();
    this.delta = 0;
    this.totalDeltaTime = 0;

    this.resizeRenderTargets();
    if (this.autoFrame) requestAnimationFrame(this.onFrameHandler);
  }

  setCamController(
    controller: IController,
    element: HTMLElement = this.canvas
  ) {
    this.camController.dispose();
    this.camController = controller;
    this.camController.connect(element);
    this.camController.onWindowResize();
  }

  onFrame() {
    if (this.disposed) return;

    this.camController.update(this.delta * 0.01);

    this.atmosphere.update(this, this.perspectiveCam.camera);
    this.terrainRenderer.update(this, this.perspectiveCam.camera);

    this.render();

    if (this.autoFrame) requestAnimationFrame(this.onFrameHandler);
  }

  dispose() {
    this.terrainRenderer.dispose();
    this.disposed = true;
    this.initialized = false;
    this.renderables.length = 0; // Clear the renderables
    this.renderTarget?.destroy();
    this.depthTexture?.destroy();
    this.camController.dispose();
    this.device.destroy();
    this.renderGroups.length = 0; // Clear the render groups
    this.overlayRenderGroups.length = 0;
    this.currentRenderList.reset();
    this.sceneBVH?.dispose();
    this.sceneBVH = null;
    this.bvhWorkerManager?.dispose();
    this.bvhWorkerManager = null;
    this.atmosphere.dispose();
    this.textureManager.dispose();
    this.samplerManager.dispose();
    this.fontManager.dispose();
    this.geometryManager.dispose();
    this.materialManager.dispose();
    this.geometryManager.dispose();
    this.guiManager.dispose();
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

  resizeRenderTargets() {
    const device = this.device;
    const canvas = this.canvas;
    let renderTargetView = this.renderTargetView;
    let renderTarget = this.renderTarget;

    // If the canvas size changing we need to reallocate the render target.
    // We also need to set the physical size of the canvas to match the computed size.
    // if (!renderTargetView) {
    const currentWidth = canvas.width || 1;
    const currentHeight = canvas.height || 1;

    if (renderTarget !== undefined) {
      // Destroy the previous render target
      renderTarget.destroy();
    }

    this.perspectiveCam.aspect = currentWidth / currentHeight;
    this.perspectiveCam.updateProjectionMatrix();

    // Resize the multisampled render target to match the new canvas size.
    renderTarget = device.createTexture({
      size: [currentWidth, currentHeight],
      sampleCount: this.sampleCount,
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

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

    renderTargetView = renderTarget.createView();
    this.renderTarget = renderTarget;
    this.renderTargetView = renderTargetView;
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

  collectUIElements(transform: Transform): void {
    if (transform.visible === false) return;

    if (transform.component instanceof UIElement) {
      this.currentRenderList.uiElements.push(transform);
    }

    for (let i = 0, l = transform.children.length; i < l; i++)
      this.collectUIElements(transform.children[i]);
  }

  organizeVisuals(transforms: Transform[], target: IRenderGroup[]) {
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

    return target;
  }

  renderGroupings(
    renderGroup: IRenderGroup[],
    pass: GPURenderPassEncoder,
    camera: Camera
  ) {
    for (const item of renderGroup) {
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

    const pCamera = this.perspectiveCam;

    for (const renderable of this.renderables) {
      renderable.update(this, deltaTime, this.totalDeltaTime);
    }

    // update scene graph
    this.scene.updateMatrixWorld();
    this.ui.updateMatrixWorld();

    // update camera matrices and frustum
    if (pCamera.camera.transform.parent === null)
      pCamera.camera.transform.updateMatrixWorld();

    // Auto-update scene BVH if enabled
    if (this.sceneBVHAutoUpdate && this.sceneBVH) {
      if (this.bvhConfig.sceneBVHUpdateThreshold !== undefined) {
        this.sceneBVH.updateThreshold = this.bvhConfig.sceneBVHUpdateThreshold;
      }
      this.sceneBVH.update();
    }

    // Auto-refit per-geometry BVHs when vertices have been modified.
    if (this.bvhConfig.autoRefitGeometryBVH) {
      this.refitDirtyGeometryBVHs();
    }

    // Clear the render list before projecting objects
    this.currentRenderList.reset();

    // Project objects in the scene. Collect those that are to be rendered.
    // When a scene BVH is available, use frustum culling to avoid
    // visiting the entire scene graph.
    if (this.sceneBVH) {
      // Build the view-projection matrix and extract frustum planes.
      _projScreenMatrix.multiplyMatrices(
        pCamera.camera.projectionMatrix,
        pCamera.camera.matrixWorldInverse
      );
      _frustum.setFromProjectionMatrix(
        _projScreenMatrix,
        WebGPUCoordinateSystem
      );

      // BVH frustum cull returns only visible visual-component transforms.
      this.sceneBVH.frustumCull(_frustum, this.currentRenderList.solids);

      // Lights and overlays are not tracked by the scene BVH, so collect
      // them with the traditional traversal.
      this.collectLightsAndOverlays(this.scene);
    } else {
      this.projectObject(this.scene, pCamera.camera);
    }

    this.collectUIElements(this.ui);

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
      this.renderGroups
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

    // Gets the device render targets ready. Checks for things like canvas resize
    if (this.canvasSizeWatcher.hasResized()) {
      this.resizeRenderTargets();
      this.camController.onWindowResize();
    }

    const device = this.device;
    const context = this.context;
    let renderTargetView = this.renderTargetView;

    if (renderTargetView) {
      const encoder = device.createCommandEncoder({
        label: 'main pass encoder',
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            // view: renderTargetView,
            // resolveTarget: context.getCurrentTexture().createView(),
            view: context.getCurrentTexture().createView(),
            clearValue: [0.0, 0.0, 0.0, 1.0],
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
      });

      const camera = this.perspectiveCam;

      this.terrainRenderer.render(this, pass, camera.camera);

      for (const renderable of this.renderables) {
        renderable.render(this, pass, camera.camera);
      }

      this.renderGroupings(renderList, pass, camera.camera);
      pass.end();
      device.queue.submit([encoder.finish()]);

      // Create a new encoder for the post-processing pass
      const postProcessingEncoder = device.createCommandEncoder({
        label: 'post-processing encoder',
      });

      const postProcessingPass = postProcessingEncoder.beginRenderPass({
        colorAttachments: [
          {
            // view: renderTargetView,
            // resolveTarget: context.getCurrentTexture().createView(),
            view: context.getCurrentTexture().createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });

      // Ensure atmosphere matrices are up-to-date (its transform is not
      // part of the solids list when BVH culling is active).
      this.atmosphere.transform.modelViewMatrix.multiplyMatrices(
        camera.camera.matrixWorldInverse,
        this.atmosphere.transform.matrixWorld
      );
      this.atmosphere.render(this, postProcessingPass, camera.camera);
      postProcessingPass.end();

      device.queue.submit([postProcessingEncoder.finish()]);

      // Overlay pass: renders on top of scene + sky with depth cleared
      if (overlayRenderList.length > 0) {
        const overlayEncoder = device.createCommandEncoder({
          label: 'overlay pass encoder',
        });

        const overlayPass = overlayEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
          depthStencilAttachment: {
            view: this.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });

        this.renderGroupings(overlayRenderList, overlayPass, camera.camera);
        overlayPass.end();
        device.queue.submit([overlayEncoder.finish()]);
      }

      // Render all UI elements in a single pass. Instance data for every
      // visible element is uploaded once, and each element is drawn via
      // firstInstance indexing so the shader reads the correct slot.
      // Text is interleaved between element quads for correct z-ordering.
      const visibleElements = this.uiVisibleElements;
      visibleElements.length = 0;
      for (const transform of this.currentRenderList.uiElements) {
        const element = transform.component as UIElement;
        if (!element?.visible) continue;
        if (element.geometry.requiresBuild)
          element.geometry.build(
            this.device,
            this.bvhConfig,
            this.bvhWorkerManager ?? undefined
          );
        if (element.material.requiresRebuild) element.material.init(this);
        visibleElements.push(element);
      }

      if (visibleElements.length > 0) {
        // Group elements by material for uniform preparation
        const elementsByMaterial = this.uiElementsByMaterial;
        elementsByMaterial.clear();
        for (const element of visibleElements) {
          const mat = element.material;
          let group = elementsByMaterial.get(mat);
          if (!group) {
            group = [];
            elementsByMaterial.set(mat, group);
          }
          group.push(element);
        }

        // Prepare uniforms for each material (uploads instance data to GPU)
        for (const [mat, elements] of elementsByMaterial) {
          (mat as IUIElementPass).prepareUniforms(
            this,
            camera.camera,
            elements
          );
        }

        const guiEncoder = device.createCommandEncoder({
          label: 'GUI encoder',
        });

        const guiPass = guiEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
        });

        let currentMaterial: IMaterialPass | null = null;
        let needsStateReset = true;
        const instanceCounters = this.uiInstanceCounters;
        instanceCounters.clear();

        for (let i = 0; i < visibleElements.length; i++) {
          const element = visibleElements[i];
          const mat = element.material;

          if (mat !== currentMaterial || needsStateReset) {
            (mat as IUIElementPass).setPassState(guiPass, element.geometry);
            currentMaterial = mat;
            needsStateReset = false;
          }

          const instanceIdx = instanceCounters.get(mat) || 0;
          instanceCounters.set(mat, instanceIdx + 1);

          const numIndices = element.geometry.indices!.length;
          guiPass.drawIndexed(numIndices, 1, 0, 0, instanceIdx);

          // Draw text on top of this element
          const textRenderer = element.textRenderer;
          if (textRenderer) {
            if (textRenderer.requiresRebuild) textRenderer.init(this);
            textRenderer.render(this, guiPass, element);
            // executeBundles clears all pass state — restore before next quad
            needsStateReset = true;
          }
        }

        guiPass.end();
        device.queue.submit([guiEncoder.finish()]);
      }
    }
  }
}
