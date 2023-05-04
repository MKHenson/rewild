import { GroupType, AttributeType } from "rewild-common";
import { Renderer } from "./Renderer";
import { Pipeline } from "../core/pipelines/Pipeline";
import { wasm } from "../core/WasmManager";
import { Geometry } from "./geometry/Geometry";
import { Object3D } from "./Object3D";
import { pipelineManager } from "./AssetManagers/PipelineManager";

export class Mesh extends Object3D {
  meshComponent: Number;
  geometry: Geometry;
  pipeline: Pipeline<any>;
  renderIndex: number;
  transformIndex: number;

  readonly modelViewMatrix: Float32Array;
  readonly normalMatrix: Float32Array;
  readonly worldMatrix: Float32Array;
  readonly slotMap: Map<AttributeType, number>;

  constructor(geometry: Geometry, pipeline: Pipeline<any>, renderer: Renderer, name?: string) {
    super(name);

    this.renderIndex = -1;
    this.geometry = geometry;
    this.pipeline = pipeline;
    this.meshComponent = -1;
    this.slotMap = new Map();

    const pipelineIndex = pipelineManager.assets.indexOf(this.pipeline);
    const pipelineInsPtr = wasm.createMeshPipelineInstance(this.pipeline.name, pipelineIndex);

    this.meshComponent = wasm.createMeshComponent(this.geometry.bufferGeometry as any, pipelineInsPtr, this.name);

    this.pipeline.vertexLayouts.map((buffer) =>
      buffer.attributes.map((attr) => {
        wasm.addPipelineAttribute(pipelineInsPtr, attr.attributeType, attr.shaderLocation);
        this.slotMap.set(attr.attributeType, attr.shaderLocation);
      })
    );

    // Assign a transform buffer to the intance
    this.transformIndex = this.pipeline.addResourceInstance(renderer, GroupType.Transform);
    wasm.addComponent(this.transform as any, this.meshComponent as any);

    this.modelViewMatrix = wasm.getFloat32Array(wasm.getTransformModelViewMatrix(this.transform as any));
    this.normalMatrix = wasm.getFloat32Array(wasm.getTransformNormalMatrix(this.transform as any));
    this.worldMatrix = wasm.getFloat32Array(wasm.getTransformWorldMatrix(this.transform as any));
  }
}
