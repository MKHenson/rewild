import { PipelineInstance } from "../pipelines/PipelineInstance";
import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { PipelineType } from "../../common/PipelineType";
import { AttributeType } from "../../common/AttributeType";

const pipelines: PipelineInstance[] = [];

export function createPipelineInstance(name: string, index: i32, type: PipelineType): PipelineInstance {
  if (type == PipelineType.Mesh) pipelines.push(new MeshPipelineInstance(name, index));
  else throw new Error(`Pipeline type not recognised`);

  return pipelines[pipelines.length - 1];
}

export function addPipelineAttribute(pipeline: PipelineInstance, type: AttributeType, location: u16): void {
  pipeline.addAttribute(type, location);
}

export function setMeshPipelineTransformIndex(pipeline: PipelineInstance, transformResourceIndex: i32): void {
  const meshPipeline = pipeline as MeshPipelineInstance;
  meshPipeline.transformResourceIndex = transformResourceIndex;
}

export { PipelineInstance, MeshPipelineInstance };
