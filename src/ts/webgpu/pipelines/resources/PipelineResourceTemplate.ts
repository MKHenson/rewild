import { GameManager } from "../../gameManager";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";
import { Defines } from "../shader-lib/utils";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export type Template = {
  group: number;
  bindings: GPUBindingResource[];
  fragmentBlock: string | null;
  vertexBlock: string | null;
};

export abstract class PipelineResourceTemplate {
  template: Template;
  groupType: GroupType;

  constructor(groupType: GroupType) {
    this.groupType = groupType;
  }

  /** Creates the resource. Must return a group index*/
  abstract build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template;

  /** Initialize the resource and return the number of initial instances to create */
  abstract initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number;

  abstract createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance;
}
