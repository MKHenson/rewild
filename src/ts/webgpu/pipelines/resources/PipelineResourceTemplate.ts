import { GameManager } from "../../gameManager";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export abstract class PipelineResourceTemplate {
  group: number;
  binding: number;

  constructor(group: number, binding: number) {
    this.group = group;
    this.binding = binding;
  }

  /** Initialize the resource and return the number of initial instances to create */
  abstract initialize(manager: GameManager, pipeline: GPURenderPipeline): number;
  abstract createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance;
}
