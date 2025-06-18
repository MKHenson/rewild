import { IRenderable } from '../types/interfaces';
import { PerspectiveCamera } from './core/PerspectiveCamera';
import { Transform } from './core/Transform';
import { Camera } from './core/Camera';
import { TextureManager } from './textures/TextureManager';
import { SamplerManager } from './textures/SamplerManager';
import { CubeRenderer } from './renderables.ts/CubeRenderer';
import { Geometry } from './geometry/Geometry';
import { IMaterialPass } from './materials/IMaterialPass';
import { Mesh } from './core/Mesh';
import { IRenderGroup } from '../types/IRenderGroup';
import { AtmosphereSkybox } from './core/AtmosphereSkybox';
import { TerrainRenderer } from './renderers/terrain/TerrainRenderer';
import { TrackballControler } from './input/TrackballController';
import { CanvasSizeWatcher } from './utils/CanvasSizeWatcher';
import { RenderList } from './core/RenderList';
import { Light } from './core/lights/Light';
import { MipMapGenerator } from './textures/MipMapGenerator';

export class Renderer {
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  sampleCount = 1;

  private context: GPUCanvasContext;
  private renderables: IRenderable[];
  private disposed: boolean;
  private renderTargetView: GPUTextureView | undefined;
  private renderTarget: GPUTexture | undefined;
  private initialized: boolean;
  public depthTexture: GPUTexture;
  public terrainRenderer: TerrainRenderer;
  textureManager: TextureManager;
  samplerManager: SamplerManager;
  mipmapGenerator: MipMapGenerator;

  perspectiveCam: PerspectiveCamera;
  scene: Transform;
  currentRenderList: RenderList;
  atmosphere: AtmosphereSkybox;
  private camController: TrackballControler;
  private canvasSizeWatcher: CanvasSizeWatcher;
  private renderGroups: IRenderGroup[];

  lastTime: number;
  delta: number;
  totalDeltaTime: number;

  private onFrameHandler: () => void;

  constructor() {
    this.onFrameHandler = this.onFrame.bind(this);
    this.scene = new Transform();
    this.atmosphere = new AtmosphereSkybox();
    this.terrainRenderer = new TerrainRenderer();
    this.renderGroups = [];

    this.scene.addChild(this.atmosphere.transform);
  }

  async init(canvas: HTMLCanvasElement, autoFrame = true) {
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

    this.camController = new TrackballControler(this.perspectiveCam, canvas);

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
    this.mipmapGenerator = new MipMapGenerator();

    await this.samplerManager.initialize(this);
    await this.textureManager.initialize(this);
    await this.terrainRenderer.init(this);

    this.renderables = await Promise.all(
      [new CubeRenderer()].map((renderable) => renderable.initialize(this))
    );

    this.lastTime = performance.now();
    this.delta = 0;
    this.totalDeltaTime = 0;

    this.resizeRenderTargets();
    if (autoFrame) requestAnimationFrame(this.onFrameHandler);
  }

  onFrame() {
    if (this.disposed) return;

    this.camController.update();

    this.atmosphere.update(this, this.perspectiveCam.camera);
    this.terrainRenderer.update(this, this.perspectiveCam.camera);

    this.render();
    requestAnimationFrame(this.onFrameHandler);
  }

  dispose() {
    this.disposed = true;
    this.initialized = false;
    this.renderables.length = 0; // Clear the renderables
    this.renderTarget?.destroy();
    this.depthTexture?.destroy();
    this.camController.dispose();
    this.device.destroy();
    this.renderGroups.length = 0; // Clear the render groups
    this.currentRenderList.reset();
    this.atmosphere.dispose();
    this.textureManager.dispose();
    this.samplerManager.dispose();
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
  projectObject(transform: Transform, camera: Camera): void {
    if (transform.visible === false) return;

    this.currentRenderList.solids.push(transform);

    if (transform.component instanceof Light) {
      this.currentRenderList.lights.push(transform.component as Light);
    }

    for (let i = 0, l = transform.children.length; i < l; i++)
      this.projectObject(unchecked(transform.children[i]), camera);
  }

  organizeMeshes() {
    // Organize all meshes so that they are grouped by material as well as geometry
    // This is done to minimize the number of draw calls

    const transforms = this.currentRenderList.solids;
    const renderList = this.renderGroups;
    renderList.length = 0; // Clear the render list

    let transform: Transform | null;
    let geometry: Geometry | null;
    let material: IMaterialPass | null;
    let mesh: Mesh;

    for (let i: i32 = 0, l: i32 = transforms.length; i < l; i++) {
      transform = transforms[i];

      const component = transform.component;

      if (component && component instanceof Mesh) {
        mesh = component as Mesh;

        if (mesh.visible === false) continue;

        geometry = mesh.geometry;
        material = mesh.material;

        const listItem = renderList.find(
          (item) => item.geometry === geometry && item.pass === material
        );
        if (listItem) {
          listItem.meshes.push(mesh);
        } else {
          renderList.push({
            geometry,
            meshes: [mesh],
            pass: material,
          });
        }
      }
    }

    return renderList;
  }

  renderGroupings(
    renderGroup: IRenderGroup[],
    pass: GPURenderPassEncoder,
    camera: Camera
  ) {
    for (const item of renderGroup) {
      if (item.geometry.requiresBuild) item.geometry.build(this.device);
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

    // update camera matrices and frustum
    if (pCamera.camera.transform.parent === null)
      pCamera.camera.transform.updateMatrixWorld();

    // Clear the render list before projecting objects
    this.currentRenderList.reset();

    // Project objects in the scene. Collect those that are to be rendererd
    this.projectObject(this.scene, pCamera.camera);

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

    const renderList = this.organizeMeshes();

    // Gets the device render targets ready. Checks for things like canvas resize
    if (this.canvasSizeWatcher.hasResized()) this.resizeRenderTargets();

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

      this.atmosphere.render(this, postProcessingPass, camera.camera);
      postProcessingPass.end();

      device.queue.submit([postProcessingEncoder.finish()]);
    }
  }
}
