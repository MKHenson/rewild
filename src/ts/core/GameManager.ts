import { InputManager } from "./InputManager";
import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { PipelineType } from "../../common/PipelineType";
import { DebugPipeline } from "./pipelines/debug-pipeline";
import { Pipeline } from "./pipelines/Pipeline";
import { createBuffer, createIndexBuffer } from "./Utils";
import { RenderQueueManager } from "./RenderQueueManager";
import { WasmInterface } from "..";
import { Texture } from "./Texture";
import { GroupType } from "../../common/GroupType";
import { ResourceType } from "../../common/ResourceType";
import { MeshPipeline } from "build/types";

const meshPipelineInstances: MeshPipeline[] = [];

export class GameManager {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  inputManager: InputManager;
  wasm: WasmInterface;

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

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.buffers = [];
    this.textures = [];
    this.samplers = [];
    this.disposed = false;
    this.currentPass = null;
    this.renderQueueManager = new RenderQueueManager(this);
    this.onResizeHandler = this.onWindowResize.bind(this);
    this.onFrameHandler = this.onFrame.bind(this);
  }

  async init(wasm: WasmInterface) {
    this.wasm = wasm;

    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");

    this.inputManager = new InputManager(this.canvas, wasm);

    const adapter = await navigator.gpu?.requestAdapter();
    const device = (await adapter?.requestDevice()) as GPUDevice;
    const context = this.canvas.getContext("webgpu") as unknown as GPUCanvasContext;
    const format = context.getPreferredFormat(adapter!);

    context.configure({
      device: device,
      format: format,
      size: this.canvasSize(),
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
    ];

    this.textures = await Promise.all(
      texturePaths.map((tp, index) => {
        const texture = new Texture(tp.name, tp.path);
        wasm.TextureFactory.createTexture(wasm.__newString(tp.name), index);
        return texture.load(device);
      })
    );

    // PIPELINES
    this.pipelines = [
      new DebugPipeline("textured", { diffuseMap: this.textures[1], NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("simple", { NUM_DIR_LIGHTS: 0 }),
    ];

    const sampleCount = 4;
    this.renderTarget = device.createTexture({
      size: this.canvasSize(),
      sampleCount,
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.renderTargetView = this.renderTarget.createView();
    this.depthTexture = device.createTexture({
      size: this.canvasSize(),
      format: "depth24plus",
      sampleCount: sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Initialize the wasm module
    wasm.AsSceneManager.init(this.canvas.width, this.canvas.height);

    this.initRuntime();

    // Setup events
    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler);
    window.addEventListener("click", (e) => {
      const pipelines = this.pipelines as DebugPipeline[];
      pipelines.forEach((p) => {
        if (p.defines.diffuseMap) {
          delete p.defines.diffuseMap;
          p.defines = p.defines;
        } else {
          p.defines.diffuseMap = this.textures[1];
          p.defines = p.defines;
        }
      });
    });
  }

  getTexture(name: string) {
    return this.textures.find((t) => t.name === name) || null;
  }

  initRuntime() {
    const wasm = this.wasm;
    const runime = wasm.Runtime.wrap(wasm.AsSceneManager.getRuntime());

    this.pipelines.forEach((p) => {
      p.build(this);
      p.initialize(this);
    });

    const containerPtr = wasm.__pin(wasm.createLevel1());
    const container = wasm.Level1.wrap(containerPtr);
    container.addAsset(this.createMesh(1, "sphere", false));
    container.addAsset(this.createMesh(1, "box", true));
    container.addAsset(this.createMesh(1, "box", true));
    wasm.__unpin(containerPtr);

    runime.addContainer(containerPtr);
  }

  createMesh(size: number, type: "box" | "sphere", useTexture = true) {
    // Get the pipeline
    const debugPipeline = this.getPipeline(useTexture ? "textured" : "simple")!;
    const pipelineIndex = this.pipelines.indexOf(debugPipeline);

    // Create an instance in WASM
    const pipelineInsPtr = this.wasm.PipelineFactory.createPipeline(
      this.wasm.__newString(debugPipeline.name),
      pipelineIndex,
      PipelineType.Mesh
    );
    const meshPipelineIns = this.wasm.MeshPipeline.wrap(pipelineInsPtr);

    meshPipelineInstances.push(meshPipelineIns);

    // Assign a transform buffer to the intance
    meshPipelineIns.transformGroupId = debugPipeline.getTemplateByType(ResourceType.Transform)!.template.group;
    meshPipelineIns.transformResourceIndex = debugPipeline.addResourceInstance(this, GroupType.Transform);

    const geometryPtr =
      type === "box" ? this.wasm.GeometryFactory.createBox(size) : this.wasm.GeometryFactory.createSphere(size);
    const meshPtr = this.wasm.createMesh(geometryPtr, pipelineInsPtr);
    return meshPtr;
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResizeHandler);
    this.inputManager?.dispose();
  }

  // TODO:
  private onWindowResize() {
    this.wasm.AsSceneManager.resize(this.canvas.width, this.canvas.height);
  }

  private onFrame() {
    if (this.disposed) return;
    this.wasm.AsSceneManager.update(performance.now());
    window.requestAnimationFrame(this.onFrameHandler);
  }

  canvasSize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const size = [this.canvas.clientWidth * devicePixelRatio, this.canvas.clientHeight * devicePixelRatio];
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
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, //background color
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthLoadValue: 1,
        depthStoreOp: "store",
        stencilLoadValue: 0,
        stencilStoreOp: "store",
      },
    });

    this.currentPass = renderPass;
    this.currentCommandEncoder = commandEncoder;
  }

  endPass() {
    this.currentPass!.endPass();
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
