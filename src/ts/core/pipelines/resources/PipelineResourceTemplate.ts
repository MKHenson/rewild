import { GameManager } from "../../GameManager";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";
import { Defines } from "../shader-lib/Utils";

export type Template = {
  group: number;
  bindings: GPUBindingResource[];
  fragmentBlock: string | null;
  vertexBlock: string | null;
};

export type BindingData = {
  binds: GPUBindGroupEntry[];
  buffer: GPUBuffer | null;
};

export abstract class PipelineResourceTemplate {
  template: Template;
  groupType: GroupType;
  groupSubType: string;

  constructor(groupType: GroupType, groupSubType: string) {
    this.groupType = groupType;
    this.groupSubType = groupSubType;
  }

  /** Creates the resource. Must return a group index*/
  abstract build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template;

  /** Initialize the resource and return the number of initial instances to create */
  abstract initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number;

  abstract getBindingData(manager: GameManager, pipeline: GPURenderPipeline): BindingData;
}
