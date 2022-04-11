import { print } from "../Imports";
import { PipelineInstance } from "../pipelines/PipelineInstance";
import { MeshPipelineInstance } from "../pipelines/MeshPipelineInstance";
import { PipelineType } from "../../common/PipelineType";

const pipelines: PipelineInstance[] = [];

export function createPipelineInstance(name: string, index: i32, type: PipelineType): PipelineInstance {
  print(`Added pipeline instance ${name}...`);
  if (type == PipelineType.Mesh) pipelines.push(new MeshPipelineInstance(name, index));
  else throw new Error(`Pipeline type not recognised`);

  return pipelines[pipelines.length - 1];
}

export { PipelineInstance, MeshPipelineInstance };
