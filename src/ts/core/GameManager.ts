import { InputManager } from "./InputManager";
import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { PipelineType } from "../../common/PipelineType";
import { DebugPipeline } from "./pipelines/debug-pipeline/DebugPipeline";
import { Pipeline } from "./pipelines/Pipeline";
import { createBuffer, createIndexBuffer } from "./Utils";
import { RenderQueueManager } from "./RenderQueueManager";
import { Texture } from "./textures/Texture";
import { GroupType } from "../../common/GroupType";
import { wasm } from "./WasmManager";
import { IBindable } from "./IBindable";
import { BitmapTexture } from "./textures/BitmapTexture";
import { BitmapCubeTexture } from "./textures/BitmapCubeTexture";
import { SkyboxPipeline } from "./pipelines/skybox-pipeline/SkyboxPipeline";
import { Object3D } from "../renderer/Object3D";

const sampleCount = 4;
const MEDIA_URL = process.env.MEDIA_URL;

export class GameManager implements IBindable {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  inputManager: InputManager;

  buffers: GPUBuffer[];
  pipelines: Pipeline<any>[];
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

  private character: Object3D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.buffers = [];
    this.textures = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
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
        const commandBuffer = wasm.__getArray(commandsIndex) as Array<number>;
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

    // TEXTURES
    const textures: Texture[] = [
      new BitmapTexture("grid", MEDIA_URL + "uv-grid.jpg", device),
      new BitmapTexture("crate", MEDIA_URL + "crate-wooden.jpg", device),
      new BitmapTexture("earth", MEDIA_URL + "earth-day-2k.jpg", device),
      new BitmapTexture(
        "ground-coastal-1",
        MEDIA_URL + "nature/dirt/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png",
        device
      ),
      new BitmapTexture(
        "block-concrete-4",
        MEDIA_URL + "construction/walls/TexturesCom_Wall_BlockConcrete4_2x2_B_1K_albedo.png",
        device
      ),
      new BitmapCubeTexture(
        "desert-sky",
        [
          MEDIA_URL + "skyboxes/desert/px.jpg",
          MEDIA_URL + "skyboxes/desert/nx.jpg",
          MEDIA_URL + "skyboxes/desert/py.jpg",
          MEDIA_URL + "skyboxes/desert/ny.jpg",
          MEDIA_URL + "skyboxes/desert/pz.jpg",
          MEDIA_URL + "skyboxes/desert/nz.jpg",
        ],
        device
      ),
      new BitmapCubeTexture(
        "starry-sky",
        [
          MEDIA_URL + "skyboxes/stars/left.png",
          MEDIA_URL + "skyboxes/stars/right.png",
          MEDIA_URL + "skyboxes/stars/top.png",
          MEDIA_URL + "skyboxes/stars/bottom.png",
          MEDIA_URL + "skyboxes/stars/front.png",
          MEDIA_URL + "skyboxes/stars/back.png",
        ],
        device
      ),
    ];

    this.textures = await Promise.all(
      textures.map((texture, index) => {
        wasm.createTexture(wasm.__newString(texture.name), index);
        return texture.load(device);
      })
    );

    // PIPELINES
    this.pipelines = [
      new DebugPipeline("coastal-floor", {
        diffuseMap: this.textures[3],
        NUM_DIR_LIGHTS: 0,
        uvScaleX: "30.0",
        uvScaleY: "30.0",
      }),
      new DebugPipeline("crate", { diffuseMap: this.textures[1], NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("simple", { NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("earth", { diffuseMap: this.textures[2], NUM_DIR_LIGHTS: 0 }),
      new DebugPipeline("concrete", { diffuseMap: this.textures[4], NUM_DIR_LIGHTS: 0 }),
      new SkyboxPipeline("skybox", { diffuseMap: this.textures[5] }),
      new SkyboxPipeline("stars", { diffuseMap: this.textures[6] }),
    ];

    const size = this.canvasSize();
    this.onResize(size, false);

    // Initialize the wasm module
    wasm.init(this.canvas.width, this.canvas.height);

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

  initRuntime() {
    const runime = wasm.Runtime.wrap(wasm.getRuntime());

    this.pipelines.forEach((p) => {
      p.build(this);
      p.initialize(this);
    });

    const containerLvl1Ptr = wasm.__pin(wasm.createLevel1());
    const containerLvl1 = wasm.Level1.wrap(containerLvl1Ptr);

    const geometrySphere = wasm.createSphere(1);
    const geometryBox = wasm.createBox(1);

    containerLvl1.addAsset(this.createMesh(geometryBox, "skybox", "skybox"));
    containerLvl1.addAsset(this.createMesh(geometrySphere, "simple", "ball"));

    for (let i = 0; i < 20; i++) containerLvl1.addAsset(this.createMesh(geometryBox, "concrete", `building-${i}`));
    for (let i = 0; i < 20; i++) containerLvl1.addAsset(this.createMesh(geometryBox, "crate", `crate-${i}`));

    this.character = new Object3D();
    this.character.transform.add(this.createMesh(geometrySphere, "simple", "character"));
    containerLvl1.addAsset(this.character.transform.valueOf());

    containerLvl1.addAsset(this.createMesh(geometryBox, "coastal-floor", "floor"));
    wasm.__unpin(containerLvl1Ptr);

    const containerTestPtr = wasm.__pin(wasm.createTestLevel());
    const containerTestLevel = wasm.TestLevel.wrap(containerTestPtr);
    containerTestLevel.addAsset(this.createMesh(geometryBox, "skybox", "skybox"));
    wasm.__unpin(containerTestPtr);

    const containerMainMenuPtr = wasm.__pin(wasm.createMainMenu());
    const containerMainMenu = wasm.MainMenu.wrap(containerMainMenuPtr);
    containerMainMenu.addAsset(this.createMesh(geometrySphere, "earth"));
    containerMainMenu.addAsset(this.createMesh(geometryBox, "stars", "skybox"));
    wasm.__unpin(containerMainMenuPtr);

    runime.addContainer(containerLvl1Ptr, false);
    runime.addContainer(containerMainMenuPtr, true);
    runime.addContainer(containerTestPtr, false);
  }

  createMesh(geometryPtr: number, pipelineName: string, name?: string) {
    // Get the pipeline

    const pipeline = this.getPipeline(pipelineName)!;
    const pipelineIndex = this.pipelines.indexOf(pipeline);

    // Create an instance in WASM
    const pipelineInsPtr = wasm.createPipelineInstance(
      wasm.__newString(pipeline.name),
      pipelineIndex,
      PipelineType.Mesh
    );
    const meshPipelineIns = wasm.MeshPipelineInstance.wrap(pipelineInsPtr);

    pipeline.vertexLayouts.map((buffer) =>
      buffer.attributes.map((attr) => meshPipelineIns.addAttribute(attr.attributeType, attr.shaderLocation))
    );

    // Assign a transform buffer to the intance
    meshPipelineIns.transformResourceIndex = pipeline.addResourceInstance(this, GroupType.Transform);

    const meshPtr = wasm.createMesh(geometryPtr, pipelineInsPtr, name ? wasm.__newString(name) : undefined);
    return meshPtr;
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
    window.requestAnimationFrame(this.onFrameHandler);
    if (this.disposed) return;

    // Check if we need to resize
    const [w, h] = this.presentationSize;
    const newSize = this.canvasSize();
    if (newSize[0] !== w || newSize[1] !== h) {
      this.onResize(newSize);
    }

    this.character.transform.translateZ(0.01);
    wasm.update(performance.now());
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

  createBufferF32(data: number, usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) {
    const f32Array = wasm.__getFloat32Array(data);
    const buffer = createBuffer(this.device, f32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(data: number, usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
    const u32Array = wasm.__getUint32Array(data);
    const buffer = createIndexBuffer(this.device, u32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }
}
