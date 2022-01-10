import { GameManager } from "../../GameManager";
import { Pipeline } from "../Pipeline";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";
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
  resourceType: ResourceType;

  constructor(groupType: GroupType, groupSubType: ResourceType) {
    this.groupType = groupType;
    this.resourceType = groupSubType;
  }

  /** Creates the resource. Must return a group index*/
  abstract build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template;
  abstract getBindingData(manager: GameManager, pipeline: GPURenderPipeline): BindingData;
}
