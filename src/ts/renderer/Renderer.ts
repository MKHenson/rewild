import { InputManager } from "../core/InputManager";
import { GroupType } from "../../common/GroupType";
import { AttributeType } from "../../common/AttributeType";
import { wasm } from "../core/WasmManager";
import { IBindable } from "../core/IBindable";
import { Clock } from "../core/Clock";
import { pipelineManager } from "./PipelineManager";
import { textureManager } from "./TextureManager";
import { Mesh } from "./Mesh";
import { ResourceType } from "../../common/ResourceType";
import { meshManager } from "./MeshManager";
import { LightingResource } from "../core/pipelines/resources/LightingResource";
import { Pipeline } from "../core/pipelines/Pipeline";
import { TransformResource } from "../core/pipelines/resources/TransformResource";
import { PipelineResourceInstance } from "../core/pipelines/resources/PipelineResourceInstance";
import { Geometry } from "./geometry/Geometry";
import { Player } from "../gameplay/Player";

const sampleCount = 4;
export type UpdateCallback = () => void;

export class Renderer implements IBindable {
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

  renderTargetView: GPUTextureView;
  renderTarget: GPUTexture;
  depthTexture: GPUTexture;

  currentPass: GPURenderPassEncoder | null;
  currentCommandEncoder: GPUCommandEncoder;
  private presentationSize: [number, number];

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
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  createBinding() {
    return {
      setupLights: this.setupLights.bind(this),
      renderComponents: this.renderComponents.bind(this),
      lock: this.lock.bind(this),
      unlock: this.unlock.bind(this),
    };
  }

  async init() {
    this.canvasSizeCache = this.canvasSize();
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
      alphaMode: "premultiplied",
    });

    this.device = device;
    this.context = context;
    this.format = format;

    await textureManager.init(device);

    const size = this.canvasSize();
    this.onResize(size, false);

    // Initialize the wasm module
    wasm.init(this.canvas.width, this.canvas.height);

    pipelineManager.init(this);
    this.player = new Player();

    // Setup events
    window.addEventListener("resize", this.onResizeHandler);
    window.requestAnimationFrame(this.onFrameHandler);
    this.clock.start();
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
      alphaMode: "premultiplied",
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

  onFrame() {
    const clock = this.clock;
    window.requestAnimationFrame(this.onFrameHandler);
    const callbacks = this.updateCallbacks;
    for (const callback of callbacks) callback();

    if (this.disposed) return;

    // Check if we need to resize
    const [w, h] = this.presentationSize;
    const newSize = this.canvasSize();
    if (newSize[0] != w || newSize[1] != h) {
      this.onResize(newSize);
    }

    wasm.update(clock.elapsedTime, clock.getDelta());
  }

  canvasSize() {
    const devicePixelRatio = 1; // TODO: Why does this not work? ---> window.devicePixelRatio || 1;
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

        if (template.projectionOffset != -1)
          device.queue.writeBuffer(transformBuffer, template.projectionOffset, projectionMatrix);
        if (template.modelViewOffset != -1)
          device.queue.writeBuffer(transformBuffer, template.modelViewOffset, mesh.modelViewMatrix);
        if (template.modelOffset != -1)
          device.queue.writeBuffer(transformBuffer, template.modelOffset, mesh.worldMatrix);
        if (template.normalOffset != -1)
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

    if (LightingResource.numDirLights != numDirectionLights) {
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
