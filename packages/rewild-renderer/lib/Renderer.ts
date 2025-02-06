import { Pane3D } from 'rewild-ui';
import { IRenderable } from '../types/interfaces';
import { CirclesRenderer } from './renderables.ts/CirclesRenderer';
import { QuadRenderer } from './renderables.ts/QuadRenderer';
import { LoadedImageQuad } from './renderables.ts/LoadedImageQuad';
import { DrawF } from './renderables.ts/DrawF';
import { GuiRenderer } from './renderables.ts/GuiRenderer';
import { CubeRenderer } from './renderables.ts/CubeRenderer';
import { PlaneRenderer } from './renderables.ts/vbo';
import { PerspectiveCamera } from './core/PerspectiveCamera';
import { Transform } from './core/Transform';
import { Camera } from './core/Camera';
import { textureManager } from './textures/TextureManager';
import { samplerManager } from './textures/SamplerManager';

export class Renderer {
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  pane: Pane3D;
  sampleCount = 4;

  private context: GPUCanvasContext;
  private renderables: IRenderable[];
  private disposed: boolean;
  private prevWidth: number;
  private prevHeight: number;
  private renderTargetView: GPUTextureView | undefined;
  private renderTarget: GPUTexture | undefined;
  private initialized: boolean;
  private depthTexture: GPUTexture;
  perspectiveCam: PerspectiveCamera;
  scene: Transform;
  private currentRenderList: RenderList;

  private lastTime: number;
  private totalDeltaTime: number;

  private onFrameHandler: () => void;

  constructor() {
    this.onFrameHandler = this.onFrame.bind(this);
    this.scene = new Transform();
  }

  async init(pane: Pane3D) {
    if (this.initialized) return;

    this.disposed = false;
    this.currentRenderList = new RenderList();
    this.initialized = false;
    this.pane = pane;
    this.renderables = [];
    const canvas = pane.canvas()!;
    this.prevWidth = canvas.clientWidth;
    this.prevHeight = canvas.clientHeight;

    this.perspectiveCam = new PerspectiveCamera(
      65,
      canvas.width / canvas.height
    );
    this.scene.addChild(this.perspectiveCam.camera.transform);
    this.perspectiveCam.camera.transform.position.set(0, 0, 5);
    this.perspectiveCam.camera.lookAt(0, 0, 0);

    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) throw new Error('need a browser that supports WebGPU');

    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('need a browser that supports WebGPU');

    device.lost.then((info) => {
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

    await samplerManager.initialize(this);
    await textureManager.initialize(this);

    this.renderables = await Promise.all(
      [
        new CirclesRenderer(),
        new CubeRenderer(),
        new QuadRenderer(),
        new LoadedImageQuad(),
        new DrawF(),
        new PlaneRenderer(),
        new GuiRenderer(),
      ].map((renderable) => renderable.initialize(this))
    );

    this.lastTime = performance.now();
    this.totalDeltaTime = 0;

    requestAnimationFrame(this.onFrameHandler);
  }

  onFrame() {
    if (this.disposed) return;

    this.render();
    requestAnimationFrame(this.onFrameHandler);
  }

  dispose() {
    this.disposed = true;
  }

  prepareRender() {
    const device = this.device;
    const canvas = this.pane.canvas()!;
    const currentWidth = canvas.width;
    const currentHeight = canvas.height;
    let renderTargetView = this.renderTargetView;
    let renderTarget = this.renderTarget;

    // If the canvas size changing we need to reallocate the render target.
    // We also need to set the physical size of the canvas to match the computed size.
    if (
      (currentWidth !== this.prevWidth ||
        currentHeight !== this.prevHeight ||
        !renderTargetView) &&
      currentWidth &&
      currentHeight
    ) {
      if (renderTarget !== undefined) {
        // Destroy the previous render target
        renderTarget.destroy();
      }

      this.perspectiveCam.aspect = canvas.width / canvas.height;
      this.perspectiveCam.updateProjectionMatrix();

      // Resize the multisampled render target to match the new canvas size.
      renderTarget = device.createTexture({
        size: [canvas.width, canvas.height],
        sampleCount: this.sampleCount,
        format: this.presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this.depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        sampleCount: this.sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      renderTargetView = renderTarget.createView();
      this.renderTarget = renderTarget;
      this.renderTargetView = renderTargetView;
      this.prevHeight = currentHeight;
      this.prevWidth = currentWidth;
    }
  }

  // TODO: Will come back later to flesh this out
  projectObject(transform: Transform, camera: Camera): void {
    if (transform.visible === false) return;

    this.currentRenderList.solids.push(transform);

    for (let i = 0, l = transform.children.length; i < l; i++)
      this.projectObject(unchecked(transform.children[i]), camera);
  }

  render() {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
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

    // Gets the device render targets ready. Checks for things like canvas resize
    this.prepareRender();

    const device = this.device;
    const context = this.context;
    let renderTargetView = this.renderTargetView;

    if (renderTargetView) {
      const encoder = device.createCommandEncoder();
      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: renderTargetView,
            resolveTarget: context.getCurrentTexture().createView(),
            clearValue: [0.2, 0.2, 0.2, 1.0],
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
      };

      const pass = encoder.beginRenderPass(renderPassDescriptor);
      const camera = this.perspectiveCam;

      for (const renderable of this.renderables) {
        renderable.render(this, pass, camera.camera);
      }

      pass.end();

      const commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);
    }
  }
}

export class RenderList {
  solids: Transform[];

  constructor() {
    this.solids = [];
  }

  reset(): void {
    this.solids.splice(0, this.solids.length);
  }
}
