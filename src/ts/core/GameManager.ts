import { InputManager } from "./InputManager";
import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { createBuffer, createIndexBuffer } from "./Utils";
import { RenderQueueManager } from "./RenderQueueManager";
import { wasm } from "./WasmManager";
import { IBindable } from "./IBindable";
import { Object3D } from "../renderer/Object3D";
import { Clock } from "./Clock";
import { pipelineManager } from "../renderer/PipelineManager";
import { textureManager } from "../renderer/TextureManager";
import { Mesh } from "../renderer/Mesh";
import { meshManager } from "../renderer/MeshManager";
import { BoxGeometry } from "../renderer/geometry/BoxGeometry";
import { SphereGeometry } from "../renderer/geometry/SphereGeometry";
import { PlaneGeometry } from "../renderer/geometry/PlaneGeometry";

const sampleCount = 4;
export class GameManager implements IBindable {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  inputManager: InputManager;
  buffers: GPUBuffer[];
  clock: Clock;

  onResizeHandler: () => void;
  onFrameHandler: () => void;
  disposed: boolean;
  renderQueueManager: RenderQueueManager;

  renderTargetView: GPUTextureView;
  renderTarget: GPUTexture;
  depthTexture: GPUTexture;

  currentPass: GPURenderPassEncoder | null;
  currentCommandEncoder: GPUCommandEncoder;
  private presentationSize: [number, number];

  character: Object3D;
  onUpdate: () => void;

  constructor(canvas: HTMLCanvasElement, onUpdate: () => void) {
    this.canvas = canvas;
    this.buffers = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
    this.clock = new Clock();
    this.onUpdate = onUpdate;
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  createBinding() {
    return {
      createBufferFromF32: this.createBufferF32.bind(this),
      createIndexBuffer: this.createIndexBuffer.bind(this),
      lock: this.lock.bind(this),
      unlock: this.unlock.bind(this),
      render: (commandsIndex: number) => {
        const commandBuffer = wasm.getInt32Array(commandsIndex);
        this.renderQueueManager.run(commandBuffer);
      },
    };
  }

  async init() {
    this.renderQueueManager = new RenderQueueManager(this);

    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");

    this.inputManager = new InputManager(this.canvas);

    const adapter = await navigator.gpu?.requestAdapter();
    const device = (await adapter?.requestDevice()) as GPUDevice;
    const context = this.canvas.getContext("webgpu") as unknown as GPUCanvasContext;
    const format = context.getPreferredFormat(adapter!);

    context.configure({
      device: device,
      format: format,
      size: this.canvasSize(),
      compositingAlphaMode: "premultiplied",
    });

    this.device = device;
    this.context = context;
    this.format = format;

    await textureManager.init(device);

    const size = this.canvasSize();
    this.onResize(size, false);

    // Initialize the wasm module
    wasm.init(this.canvas.width, this.canvas.height);

    this.initRuntime();

    // Setup events
    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler);
    this.clock.start();
  }

  initRuntime() {
    pipelineManager.init(this);

    const containerLvl1Ptr = wasm.createLevel1();
    const geometrySphere = new SphereGeometry(1, 64, 32);
    const geometryBox = new BoxGeometry();
    const geometryPlane = new PlaneGeometry();

    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometryBox.bufferGeometry, "skybox", "skybox")).transform as any
    );
    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometrySphere.bufferGeometry, "simple", "ball")).transform as any
    );

    for (let i = 0; i < 20; i++)
      wasm.addAsset(
        containerLvl1Ptr,
        meshManager.addMesh(this.createMesh(geometryBox.bufferGeometry, "concrete", `building-${i}`)).transform as any
      );
    for (let i = 0; i < 20; i++)
      wasm.addAsset(
        containerLvl1Ptr,
        meshManager.addMesh(this.createMesh(geometryBox.bufferGeometry, "crate", `crate-${i}`)).transform as any
      );

    this.character = new Object3D();
    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometryPlane.bufferGeometry, "coastal-floor", "floor")).transform as any
    );

    const containerTestPtr = wasm.createTestLevel();
    wasm.addAsset(
      containerTestPtr,
      meshManager.addMesh(this.createMesh(geometryBox.bufferGeometry, "skybox", "skybox")).transform as any
    );

    const containerMainMenuPtr = wasm.createMainMenu();

    wasm.addAsset(
      containerMainMenuPtr,
      meshManager.addMesh(this.createMesh(geometrySphere.bufferGeometry, "earth")).transform as any
    );
    wasm.addAsset(
      containerMainMenuPtr,
      meshManager.addMesh(this.createMesh(geometryBox.bufferGeometry, "stars", "skybox")).transform as any
    );

    wasm.addContainer(containerLvl1Ptr, false);
    wasm.addContainer(containerMainMenuPtr, true);
    wasm.addContainer(containerTestPtr, false);
  }

  createMesh(geometryPtr: Number, pipelineName: string, name?: string) {
    const pipeline = pipelineManager.getPipeline(pipelineName)!;
    return new Mesh(geometryPtr, pipeline, this, name);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResizeHandler);
    this.inputManager?.dispose();
  }

  private onResize(newSize: [number, number], updateWasm = true) {
    // Destroy the previous render target
    if (this.renderTarget) {
      this.renderTarget.destroy();
      this.depthTexture.destroy();
    }

    this.presentationSize = newSize;

    // Reconfigure the canvas size.
    this.context.configure({
      device: this.device,
      format: this.format,
      size: this.presentationSize,
      compositingAlphaMode: "premultiplied",
    });

    this.renderTarget = this.device.createTexture({
      size: this.presentationSize,
      sampleCount,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthTexture = this.device.createTexture({
      size: this.presentationSize,
      format: "depth24plus",
      sampleCount: sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.renderTargetView = this.renderTarget.createView();

    if (updateWasm) wasm.resize(this.canvas.width, this.canvas.height);
  }

  private onFrame() {
    const clock = this.clock;
    window.requestAnimationFrame(this.onFrameHandler);
    this.onUpdate();

    if (this.disposed) return;

    // Check if we need to resize
    const [w, h] = this.presentationSize;
    const newSize = this.canvasSize();
    if (newSize[0] !== w || newSize[1] !== h) {
      this.onResize(newSize);
    }

    // this.character.transform.translateZ(0.01);
    wasm.update(clock.elapsedTime, clock.getDelta());
  }

  canvasSize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const size: [number, number] = [
      this.canvas.clientWidth * devicePixelRatio,
      this.canvas.clientHeight * devicePixelRatio,
    ];
    return size;
  }

  hasWebGPU() {
    if (!navigator.gpu) {
      return false;
    } else {
      return true;
    }
  }

  startPass() {
    const device = this.device;
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTargetView,
          resolveTarget: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, //background color
          storeOp: "store",
          loadOp: "clear",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "store",
        depthClearValue: 1,
      },
    });

    this.currentPass = renderPass;
    this.currentCommandEncoder = commandEncoder;
  }

  endPass() {
    this.currentPass!.end();
    this.device.queue.submit([this.currentCommandEncoder.finish()]);
  }

  createBufferF32(data: number, usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
    const f32Array = wasm.getFloat32Array(data);
    const buffer = createBuffer(this.device, f32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(data: number, usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
    const u32Array = wasm.getUint32Array(data);
    const buffer = createIndexBuffer(this.device, u32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }
}
