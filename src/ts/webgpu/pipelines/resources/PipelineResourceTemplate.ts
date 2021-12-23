import { GameManager } from "../../gameManager";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export abstract class PipelineResourceTemplate {
  group: number;
  binding: number;

  constructor(group: number, binding: number) {
    this.group = group;
    this.binding = binding;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    return "";
  }

  /** Initialize the resource and return the number of initial instances to create */
  abstract initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number;
  abstract createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance;
}
