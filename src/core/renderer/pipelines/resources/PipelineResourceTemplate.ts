import { Renderer } from '../../Renderer';
import { Pipeline } from '../Pipeline';
import { GroupType, ResourceType } from 'rewild-common';
import { Defines } from '../shader-lib/Utils';

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
  id?: string;

  constructor(groupType: GroupType, groupSubType: ResourceType, id?: string) {
    this.groupType = groupType;
    this.resourceType = groupSubType;
    this.id = id;
  }

  /** Creates the resource. Must return a group index*/
  abstract build<T extends Defines<T>>(
    renderer: Renderer,
    pipeline: Pipeline<T>,
    curBindIndex: number
  ): Template;
  abstract getBindingData(
    renderer: Renderer,
    pipeline: GPURenderPipeline
  ): BindingData;
}
