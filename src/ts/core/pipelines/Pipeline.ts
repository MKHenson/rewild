import { GameManager } from "../GameManager";
import { PipelineResourceTemplate } from "./resources/PipelineResourceTemplate";
import { PipelineResourceInstance } from "./resources/PipelineResourceInstance";
import { GroupType } from "../../../common/GroupType";
import "./shader-lib/Utils";
import { Defines, SourceFragments } from "./shader-lib/Utils";

export class GroupMapping {
  index: number;
  bindingCount: number;

  constructor(index: number) {
    this.index = index;
    this.bindingCount = 0;
  }

  getBinding(): number {
    const toRet = this.bindingCount;
    this.bindingCount++;
    return toRet;
  }
}

export abstract class Pipeline<T extends Defines<T>> {
  name: string;
  renderPipeline: GPURenderPipeline | null;
  fragmentSource: SourceFragments<T>;
  vertexSource: SourceFragments<T>;
  private _defines: Defines<T>;
  private resourceTemplates: PipelineResourceTemplate[];
  resourceInstances: Map<GroupType, PipelineResourceInstance[]>;
  rebuild: boolean;

  groupMapping: Map<GroupType, GroupMapping>;
  private groups: number;

  constructor(name: string, vertexSource: SourceFragments<T>, fragmentSource: SourceFragments<T>, defines: Defines<T>) {
    this.name = name;
    this.renderPipeline = null;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.resourceTemplates = [];
    this.resourceInstances = new Map();
    this.defines = defines;
    this.rebuild = true;

    this.groupMapping = new Map();
    this.groups = 0;
  }

  set defines(defines: T) {
    this._defines = defines;
    this.rebuild = true;
  }

  get defines(): T {
    return this._defines;
  }

  groupIndex(type: GroupType): number {
    if (this.groupMapping.has(type)) return this.groupMapping.get(type)!.index;
    else {
      const groupMapping = new GroupMapping(this.groups);
      this.groupMapping.set(type, groupMapping);
      this.groups++;
      return groupMapping.index;
    }
  }

  bindingIndex(type: GroupType): number {
    if (this.groupMapping.has(type)) {
      const groupMapping = this.groupMapping.get(type)!;
      return groupMapping.getBinding();
    } else {
      const groupMapping = new GroupMapping(this.groups);
      this.groupMapping.set(type, groupMapping);
      this.groups++;
      return groupMapping.getBinding();
    }
  }

  /** Use this function to add resource templates */
  abstract onAddResources(): void;

  findTemplateByType(type: GroupType) {
    return this.resourceTemplates.find((r) => r.groupType === type) || null;
  }

  addTemplate(template: PipelineResourceTemplate) {
    this.resourceTemplates.push(template);
    return this;
  }

  build(gameManager: GameManager): void {
    this.rebuild = false;

    const resourceInstanceMap = this.resourceInstances;
    const keys = Array.from(this.resourceTemplates.keys());

    // Destroy previous instances
    keys.forEach((key) => {
      const resourceInstances = resourceInstanceMap.get(key);
      resourceInstances?.forEach((i) => {
        i.dispose();
      });
    });

    // Reset
    this.resourceTemplates.splice(0, this.resourceTemplates.length);
    this.groupMapping.clear();
    this.groups = 0;

    this.onAddResources();

    let curBinding = 0;
    let prevGroup = -1;
    this.resourceTemplates.forEach((resourceTemplate) => {
      const template = resourceTemplate.build(gameManager, this, curBinding);

      if (prevGroup !== -1) {
        if (prevGroup === template.group) curBinding += template.bindings.length;
        else curBinding = 0;
      }

      prevGroup = template.group;
      resourceTemplate.template = template;
    });
  }

  initialize(gameManager: GameManager): void {
    const prevKeys = Array.from(this.resourceInstances.keys());
    const curKeys = this.resourceTemplates.map((r) => r.groupType);

    // Remove any unused instances
    prevKeys.forEach((key) => {
      if (!curKeys.includes(key)) this.resourceInstances.delete(key);
    });

    this.resourceTemplates.forEach((resourceTemplate) => {
      let numInstancesToCreate = resourceTemplate.initialize(gameManager, this);
      let instances: PipelineResourceInstance[];

      // If we previously had instances, then save the number of them
      // as we have to re-create the same amount as before. Otherwise just create 1;
      if (this.resourceInstances.has(resourceTemplate.groupType)) {
        instances = this.resourceInstances.get(resourceTemplate.groupType)!;
        numInstancesToCreate = instances.length;
        instances.splice(0, instances.length);
      } else {
        instances = [];
        this.resourceInstances.set(resourceTemplate.groupType, instances);
      }

      for (let i = 0; i < numInstancesToCreate; i++) {
        instances.push(resourceTemplate.createInstance(gameManager, this.renderPipeline!));
      }
    });
  }

  addResourceInstance(manager: GameManager, type: GroupType) {
    const template = this.findTemplateByType(type);

    if (template) {
      const newInstance = template.createInstance(manager, this.renderPipeline!);

      const instanceArray = this.resourceInstances.get(type)!;
      instanceArray.push(newInstance);
      return instanceArray.length - 1;
    } else throw new Error("Pipeline does not use resource type");
  }
}
