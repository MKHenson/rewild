import { GroupType } from "../../common/GroupType";
import { GameManager } from "../core/GameManager";
import { Pipeline } from "../core/pipelines/Pipeline";
import { wasm } from "../core/WasmManager";
import { Object3D } from "./Object3D";
import { pipelineManager } from "./PipelineManager";

export class Mesh extends Object3D {
  meshComponent: Number;
  geometry: Number;
  pipeline: Pipeline<any>;
  renderIndex: number;

  constructor(geometryPtr: Number, pipeline: Pipeline<any>, manager: GameManager, name?: string) {
    super(name);

    this.renderIndex = -1;
    this.geometry = geometryPtr;
    this.pipeline = pipeline;
    this.meshComponent = -1;

    const pipelineIndex = pipelineManager.pipelines.indexOf(this.pipeline);
    const pipelineInsPtr = wasm.createMeshPipelineInstance(this.pipeline.name, pipelineIndex);

    this.meshComponent = wasm.createMeshComponent(this.geometry as any, pipelineInsPtr, this.name);

    this.pipeline.vertexLayouts.map((buffer) =>
      buffer.attributes.map((attr) =>
        wasm.addPipelineAttribute(pipelineInsPtr, attr.attributeType, attr.shaderLocation)
      )
    );

    // Assign a transform buffer to the intance
    wasm.setMeshPipelineTransformIndex(pipelineInsPtr, this.pipeline.addResourceInstance(manager, GroupType.Transform));
    wasm.addComponent(this.transform as any, this.meshComponent as any);
  }

  setRenderIndex(index: number) {
    wasm.setMeshRenderIndex(this.meshComponent as any, index);
  }
}
