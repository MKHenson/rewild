import { GroupType } from "../../common/GroupType";
import { GameManager } from "../core/GameManager";
import { Pipeline } from "../core/pipelines/Pipeline";
import { wasm } from "../core/WasmManager";
import { Object3D } from "./Object3D";
import { pipelineManager } from "./PipelineManager";

export class Mesh extends Object3D {
  transform: Number;

  constructor(geometryPtr: Number, pipeline: Pipeline<any>, manager: GameManager, name?: string) {
    super(false);

    const pipelineIndex = pipelineManager.pipelines.indexOf(pipeline);

    // Create an instance in WASM
    const pipelineInsPtr = wasm.createMeshPipelineInstance(pipeline.name, pipelineIndex);

    pipeline.vertexLayouts.map((buffer) =>
      buffer.attributes.map((attr) =>
        wasm.addPipelineAttribute(pipelineInsPtr, attr.attributeType, attr.shaderLocation)
      )
    );

    // Assign a transform buffer to the intance
    wasm.setMeshPipelineTransformIndex(pipelineInsPtr, pipeline.addResourceInstance(manager, GroupType.Transform));

    const meshPtr = wasm.createMesh(geometryPtr as any, pipelineInsPtr, name);
    this.transform = meshPtr;
  }
}
