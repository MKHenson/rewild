import { print } from "../Imports";
import { Pipeline } from "../pipelines/Pipeline";
import { MeshPipeline } from "../pipelines/MeshPipeline";
import { PipelineType } from "../../common/PipelineType";

const pipelines: Pipeline[] = [];

export function createPipeline(name: string, index: i32, type: PipelineType): Pipeline {
  print(`Added pipeline ${name}...`);
  if (type == PipelineType.Mesh) pipelines.push(new MeshPipeline(name, index));
  else throw new Error(`Pipeline type not recognised`);

  return pipelines[pipelines.length - 1];
}

export { Pipeline, MeshPipeline };
