import { InputManager } from "./InputManager";
import { GPUBufferUsageFlags } from "../../common/GPUEnums";
import { GroupType } from "../../common/GroupType";
import { AttributeType } from "../../common/AttributeType";
import { createBufferFromF32, createIndexBufferU32 } from "./Utils";
import { RenderQueueManager } from "./RenderQueueManager";
import { wasm } from "./WasmManager";
import { IBindable } from "./IBindable";
import { Object3D } from "../renderer/Object3D";
import { Clock } from "./Clock";
import { pipelineManager } from "../renderer/PipelineManager";
import { textureManager } from "../renderer/TextureManager";
import { Mesh } from "../renderer/Mesh";
import { ResourceType } from "../../common/ResourceType";
import { meshManager } from "../renderer/MeshManager";
import { BoxGeometry } from "../renderer/geometry/BoxGeometry";
import { SphereGeometry } from "../renderer/geometry/SphereGeometry";
import { PlaneGeometry } from "../renderer/geometry/PlaneGeometry";
import { LightingResource } from "./pipelines/resources/LightingResource";
import { Pipeline } from "./pipelines/Pipeline";
import { TransformResource } from "./pipelines/resources/TransformResource";
import { PipelineResourceInstance } from "./pipelines/resources/PipelineResourceInstance";
import { Geometry } from "../renderer/geometry/Geometry";
import { Player } from "../gameplay/Player";

const sampleCount = 4;
export type UpdateCallback = () => void;

export class GameManager implements IBindable {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  inputManager: InputManager;
  buffers: GPUBuffer[];
  clock: Clock;
  player: Player;

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
  updateCallbacks: UpdateCallback[];

  canvasSizeCache: [number, number];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.buffers = [];
    this.disposed = false;
    this.currentPass = null;
    this.onFrameHandler = this.onFrame.bind(this);
    this.clock = new Clock();
    this.updateCallbacks = [];
    window.addEventListener("resize", (e) => (this.canvasSizeCache = this.canvasSize()));
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
      setupLights: this.setupLights.bind(this),
      renderComponents: this.renderComponents.bind(this),
      lock: this.lock.bind(this),
      unlock: this.unlock.bind(this),
      render: (commandsIndex: number) => {
        const commandBuffer = wasm.getInt32Array(commandsIndex);
        commandBuffer;
        //this.renderQueueManager.run(commandBuffer);
      },
    };
  }

  async init() {
    this.canvasSizeCache = this.canvasSize();
    this.renderQueueManager = new RenderQueueManager(this);

    const hasGPU = this.hasWebGPU();
    if (!hasGPU) throw new Error("Your current browser does not support WebGPU!");

    this.inputManager = new InputManager(this.canvas);

    const adapter = await navigator.gpu?.requestAdapter();
    const device = (await adapter?.requestDevice()) as GPUDevice;
    const context = this.canvas.getContext("webgpu") as unknown as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();

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
    const geometrySphere = new SphereGeometry(1, 64, 32).build(this);
    const geometryBox = new BoxGeometry().build(this);
    const geometryPlane = new PlaneGeometry().build(this);

    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometryBox, "skybox", "skybox")).transform as any
    );
    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometrySphere, "simple", "ball")).transform as any
    );

    for (let i = 0; i < 20; i++)
      wasm.addAsset(
        containerLvl1Ptr,
        meshManager.addMesh(this.createMesh(geometryBox, "concrete", `building-${i}`)).transform as any
      );
    for (let i = 0; i < 20; i++)
      wasm.addAsset(
        containerLvl1Ptr,
        meshManager.addMesh(this.createMesh(geometryBox, "crate", `crate-${i}`)).transform as any
      );

    this.character = new Object3D();
    wasm.addAsset(
      containerLvl1Ptr,
      meshManager.addMesh(this.createMesh(geometryPlane, "coastal-floor", "floor")).transform as any
    );

    const containerTestPtr = wasm.createTestLevel();
    wasm.addAsset(
      containerTestPtr,
      meshManager.addMesh(this.createMesh(geometryBox, "skybox", "skybox")).transform as any
    );

    const containerMainMenuPtr = wasm.createMainMenu();

    wasm.addAsset(containerMainMenuPtr, meshManager.addMesh(this.createMesh(geometrySphere, "earth")).transform as any);
    wasm.addAsset(
      containerMainMenuPtr,
      meshManager.addMesh(this.createMesh(geometryBox, "stars", "skybox")).transform as any
    );

    this.player = new Player();

    wasm.addAsset(containerLvl1Ptr, this.player.transformPtr as any);

    wasm.addContainer(containerLvl1Ptr, false);
    wasm.addContainer(containerMainMenuPtr, true);
    wasm.addContainer(containerTestPtr, false);
  }

  createMesh(geometry: Geometry, pipelineName: string, name?: string) {
    const pipeline = pipelineManager.getPipeline(pipelineName)!;
    const mesh = new Mesh(geometry, pipeline, this, name);
    return mesh;
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
    const callbacks = this.updateCallbacks;
    for (const callback of callbacks) callback();

    if (this.disposed) return;

    // Check if we need to resize
    const [w, h] = this.presentationSize;
    const newSize = this.canvasSizeCache;
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
    const buffer = createBufferFromF32(this.device, f32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  createIndexBuffer(data: number, usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
    const u32Array = wasm.getUint32Array(data);
    const buffer = createIndexBufferU32(this.device, u32Array, usageFlag);
    this.buffers.push(buffer);
    return this.buffers.length - 1;
  }

  renderComponents(camera: Number, meshes: number[]) {
    this.startPass();

    let mesh: Mesh | undefined;
    let pipeline: Pipeline<any>;
    let pass = this.currentPass!;
    let instances: PipelineResourceInstance[];
    let instance: PipelineResourceInstance;
    const device = this.device;
    const projectionMatrix = wasm.getFloat32Array(wasm.getCameraProjectionMatrix(camera as any));

    for (let i = 0, l = meshes.length; i < l; i++) {
      const meshPtr = meshes[i] | 0;
      mesh = meshManager.meshes.get(meshPtr);

      if (mesh) {
        // Set pipeline
        const newPipeline = mesh.pipeline;

        if (newPipeline.rebuild) {
          newPipeline.build(this);
          newPipeline.initialize(this);
        }

        pipeline = newPipeline;
        pass.setPipeline(pipeline.renderPipeline!);

        // Set transform
        const template = pipeline.getTemplateByGroup(GroupType.Transform)! as TransformResource;
        instances = pipeline.groupInstances.get(GroupType.Transform)!;
        const transformBuffer = instances[mesh.transformIndex].buffers![0];

        if (template.projectionOffset !== -1)
          device.queue.writeBuffer(transformBuffer, template.projectionOffset, projectionMatrix);
        if (template.modelViewOffset !== -1)
          device.queue.writeBuffer(transformBuffer, template.modelViewOffset, mesh.modelViewMatrix);
        if (template.modelOffset !== -1)
          device.queue.writeBuffer(transformBuffer, template.modelOffset, mesh.worldMatrix);
        if (template.normalOffset !== -1)
          device.queue.writeBuffer(transformBuffer, template.normalOffset, mesh.normalMatrix);

        // Set transform bind group
        instances = pipeline!.groupInstances.get(GroupType.Transform)!;
        instance = instances?.[mesh.transformIndex];
        if (instance) pass.setBindGroup(instance.group, instance.bindGroup);

        // Set material bind group
        instances = pipeline!.groupInstances.get(GroupType.Material)!;
        instance = instances?.[0];
        if (instance) pass.setBindGroup(instance.group, instance.bindGroup);

        // Set attribute buffers
        if (mesh.geometry && mesh.pipeline) {
          const attributeMap = mesh.geometry.attributes;
          const slotMap = mesh.slotMap;

          if (attributeMap) {
            if (attributeMap.has(AttributeType.POSITION) && slotMap.has(AttributeType.POSITION)) {
              pass.setVertexBuffer(
                slotMap.get(AttributeType.POSITION)!,
                attributeMap.get(AttributeType.POSITION)!.gpuBuffer!
              );
            }

            if (attributeMap.has(AttributeType.NORMAL) && slotMap.has(AttributeType.NORMAL)) {
              pass.setVertexBuffer(
                slotMap.get(AttributeType.NORMAL)!,
                attributeMap.get(AttributeType.NORMAL)!.gpuBuffer!
              );
            }

            if (attributeMap.has(AttributeType.UV) && slotMap.has(AttributeType.UV)) {
              pass.setVertexBuffer(slotMap.get(AttributeType.UV)!, attributeMap.get(AttributeType.UV)!.gpuBuffer!);
            }

            if (mesh.geometry.indexBuffer) {
              pass.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
              pass.drawIndexed(mesh.geometry.indices.length);
            } else {
            }
          }
        }
      }
    }

    this.endPass();
  }

  setupLights(
    numDirectionLights: number,
    configArrayPtr: number,
    sceneArrayPtr: number,
    directionArrayPtr: number
  ): void {
    const pipelines = pipelineManager.pipelines;
    let buffer: GPUBuffer;
    const device = this.device;

    if (LightingResource.numDirLights !== numDirectionLights) {
      LightingResource.numDirLights = numDirectionLights;
      LightingResource.rebuildDirectionLights = true;
      pipelines.forEach((p) => {
        if (p.getTemplateByType(ResourceType.Material)) {
          p.defines = { ...p.defines, NUM_DIR_LIGHTS: numDirectionLights };
        }
      });
    }

    buffer = LightingResource.lightingConfig;
    if (buffer) {
      const info = wasm.getUint32Array(configArrayPtr);
      device.queue.writeBuffer(buffer, 0, info);
    }

    buffer = LightingResource.sceneLightingBuffer;
    if (buffer) {
      const ambientLights = wasm.getFloat32Array(sceneArrayPtr);
      device.queue.writeBuffer(buffer, 0, ambientLights);
    }

    buffer = LightingResource.directionLightsBuffer;
    if (buffer) {
      const dirLights = wasm.getFloat32Array(directionArrayPtr);
      device.queue.writeBuffer(buffer, 0, dirLights);
    }
  }
}
