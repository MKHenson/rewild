import { InputManager } from "./InputManager";
import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { PipelineType } from "../../common/PipelineType";
import { DebugPipeline } from "./pipelines/debug-pipeline";
import { Pipeline } from "./pipelines/Pipeline";
import { createBuffer, createIndexBuffer } from "./Utils";
import { RenderQueueManager } from "./RenderQueueManager";
import { Texture } from "./Texture";
import { GroupType } from "../../common/GroupType";
import { ResourceType } from "../../common/ResourceType";
import { MeshPipeline } from "build/types";
import { WasmManager } from "./WasmManager";

const meshPipelineInstances: MeshPipeline[] = [];
const sampleCount = 4;

export class GameManager {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  inputManager: InputManager;
  wasmManager: WasmManager;

  buffers: GPUBuffer[];
  pipelines: Pipeline<any>[];
  samplers: GPUSampler[];
  textures: Texture[];

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.buffers = [];
    this.textures = [];
    this.samplers = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
  }

  async init(wasmManager: WasmManager) {
    this.wasmManager = wasmManager;
    this.renderQueueManager = new RenderQueueManager(this, wasmManager);
    const wasmExports = wasmManager.exports;

    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");

    this.inputManager = new InputManager(this.canvas, wasmManager);

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

    this.samplers = [
      device.createSampler({
        minFilter: "linear",
        magFilter: "linear",
      }),
    ];

    // TEXTURES
    const texturePaths = [
      { name: "grid", path: "./dist/media/uv-grid.jpg" },
      { name: "crate", path: "./dist/media/crate-wooden.jpg" },
      { name: "earth", path: "./dist/media/earth-day-2k.jpg" },
    ];

    this.textures = await Promise.all(
      texturePaths.map((tp, index) => {
        const texture = new Texture(tp.name, tp.path);
        wasmExports.createTexture(wasmExports.__newString(tp.name), index);
        return texture.load(device);
      })
    );

    // PIPELINES
    this.pipelines = [
      new DebugPipeline("textured", { diffuseMap: this.textures[1], NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("simple", { NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("earth", { diffuseMap: this.textures[2], NUM_DIR_LIGHTS: 0 }),
    ];

    const size = this.canvasSize();
    this.onResize(size, false);

    // Initialize the wasm module
    wasmExports.init(this.canvas.width, this.canvas.height);

    this.initRuntime();

    // Setup events
    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler);
    // window.addEventListener("click", (e) => {
    //   const pipelines = this.pipelines as DebugPipeline[];
    //   pipelines.forEach((p) => {
    //     if (p.defines.diffuseMap) {
    //       delete p.defines.diffuseMap;
    //       p.defines = p.defines;
    //     } else {
    //       p.defines.diffuseMap = this.textures[1];
    //       p.defines = p.defines;
    //     }
    //   });
    // });
  }

  getTexture(name: string) {
    return this.textures.find((t) => t.name === name) || null;
  }

  initRuntime() {
    const wasm = this.wasmManager.exports;
    const runime = wasm.Runtime.wrap(wasm.getRuntime());

    this.pipelines.forEach((p) => {
      p.build(this);
      p.initialize(this);
    });

    const containerLvl1Ptr = wasm.__pin(wasm.createLevel1());
    const containerLvl1 = wasm.Level1.wrap(containerLvl1Ptr);
    containerLvl1.addAsset(this.createMesh(1, "sphere", "simple"));
    containerLvl1.addAsset(this.createMesh(1, "box", "textured"));
    containerLvl1.addAsset(this.createMesh(1, "box", "textured"));
    wasm.__unpin(containerLvl1Ptr);

    const containerMainMenuPtr = wasm.__pin(wasm.createMainMenu());
    const containerMainMenu = wasm.MainMenu.wrap(containerMainMenuPtr);
    containerMainMenu.addAsset(this.createMesh(1, "sphere", "earth"));
    wasm.__unpin(containerMainMenuPtr);

    runime.addContainer(containerLvl1Ptr, false);
    runime.addContainer(containerMainMenuPtr, true);
  }

  createMesh(size: number, type: "box" | "sphere", pipelineName: string) {
    // Get the pipeline
    const debugPipeline = this.getPipeline(pipelineName)!;
    const pipelineIndex = this.pipelines.indexOf(debugPipeline);
    const wasmExports = this.wasmManager.exports;

    // Create an instance in WASM
    const pipelineInsPtr = wasmExports.createPipeline(
      wasmExports.__newString(debugPipeline.name),
      pipelineIndex,
      PipelineType.Mesh
    );
    const meshPipelineIns = wasmExports.MeshPipeline.wrap(pipelineInsPtr);

    meshPipelineInstances.push(meshPipelineIns);

    // Assign a transform buffer to the intance
    meshPipelineIns.transformGroupId = debugPipeline.getTemplateByType(ResourceType.Transform)!.template.group;
    meshPipelineIns.transformResourceIndex = debugPipeline.addResourceInstance(this, GroupType.Transform);

    const geometryPtr = type === "box" ? wasmExports.createBox(size) : wasmExports.createSphere(size);
    const meshPtr = wasmExports.createMesh(geometryPtr, pipelineInsPtr);
    return meshPtr;
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResizeHandler);
    this.inputManager?.dispose();
  }

  private onResize(newSize: [number, number], updateWasm = true) {
    if (this.renderTarget) {
      // Destroy the previous render target
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

    if (updateWasm) this.wasmManager.exports.resize(this.canvas.width, this.canvas.height);
  }

  private onFrame() {
    window.requestAnimationFrame(this.onFrameHandler);
    if (this.disposed) return;

    // Check if we need to resize
    const [w, h] = this.presentationSize;
    const newSize = this.canvasSize();
    if (newSize[0] !== w || newSize[1] !== h) {
      this.onResize(newSize);
    }

    this.wasmManager.exports.update(performance.now());
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

  getPipeline(name: string) {
    return this.pipelines.find((p) => p.name === name);
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

  createBufferF32(
    data: Float32Array,
    usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  ) {
    const buffer = createBuffer(this.device, data, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(
    data: Uint32Array,
    usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
  ) {
    const buffer = createIndexBuffer(this.device, data, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }
}
