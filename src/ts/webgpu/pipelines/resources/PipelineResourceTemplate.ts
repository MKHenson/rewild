import { GameManager } from "../../gameManager";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export abstract class PipelineResourceTemplate {
  group: number;

  constructor() {
    this.group = -1;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    return "";
  }

  /** Creates the resource. Must return a group index*/
  abstract build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number;

  /** Initialize the resource and return the number of initial instances to create */
  abstract initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number;

  abstract createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance;
}
