import { GameManager } from "../gameManager";
import { PipelineResourceTemplate } from "./resources/PipelineResourceTemplate";
import { PipelineResourceInstance } from "./resources/PipelineResourceInstance";
import { PipelineResourceType } from "../../../common/PipelineResourceType";
import "./shader-lib/utils";
import { Defines, SourceFragments } from "./shader-lib/utils";

export abstract class Pipeline<T extends Defines<T>> {
  name: string;
  renderPipeline: GPURenderPipeline | null;
  fragmentSource: SourceFragments<T>;
  vertexSource: SourceFragments<T>;
  private _defines: Defines<T>;
  resourceTemplates: Map<PipelineResourceType, PipelineResourceTemplate>;
  resourceInstances: Map<PipelineResourceType, PipelineResourceInstance[]>;
  rebuild: boolean;

  groupMapping: Map<PipelineResourceType, number>;
  private groups: number;

  constructor(name: string, vertexSource: SourceFragments<T>, fragmentSource: SourceFragments<T>, defines: Defines<T>) {
    this.name = name;
    this.renderPipeline = null;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.resourceTemplates = new Map();
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

  groupIndex(type: PipelineResourceType): number {
    if (this.groupMapping.has(type)) return this.groupMapping.get(type)!;
    else {
      const group = this.groups;
      this.groupMapping.set(type, group);
      this.groups++;
      return group;
    }
  }

  build(gameManager: GameManager): void {
    this.rebuild = false;

    const resourceInstanceMap = this.resourceInstances;
    const keys = Array.from(this.resourceTemplates.keys());

    // Destroy previous instances
    keys.forEach((key) => {
      const resourceInstances = resourceInstanceMap.get(key)!;
      resourceInstances.forEach((i) => {
        i.dispose();
      });
    });

    // Reset
    this.resourceTemplates = new Map();
    this.groupMapping = new Map();
    this.groups = 0;
  }

  initialize(gameManager: GameManager): void {
    const prevKeys = Array.from(this.resourceInstances.keys());
    const curKeys = Array.from(this.resourceTemplates.keys());

    // Remove any unused instances
    prevKeys.forEach((key) => {
      if (!curKeys.includes(key)) this.resourceInstances.delete(key);
    });

    this.resourceTemplates.forEach((resourceTemplate, key) => {
      let numInstancesToCreate = resourceTemplate.initialize(gameManager, this.renderPipeline!);
      let instances: PipelineResourceInstance[];

      // If we previously had instances, then save the number of them
      // as we have to re-create the same amount as before. Otherwise just create 1;
      if (this.resourceInstances.has(key)) {
        instances = this.resourceInstances.get(key)!;
        numInstancesToCreate = instances.length;
        instances.splice(0, instances.length);
      } else {
        instances = [];
        this.resourceInstances.set(key, instances);
      }

      for (let i = 0; i < numInstancesToCreate; i++) {
        instances.push(resourceTemplate.createInstance(gameManager, this.renderPipeline!));
      }
    });
  }

  // createBufferResource(type: PipelineResourceType, bufferSize: number, device: GPUDevice, label?: string) {
  //   const buffer = device.createBuffer({
  //     label,
  //     size: bufferSize,
  //     usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  //   });

  //   const resource: GPUBindingResource = {
  //     buffer,
  //     offset: 0,
  //     size: bufferSize,
  //   };

  //   const group = this.requestGroupIndex(type);

  //   const bindGroup = device.createBindGroup({
  //     label: label,
  //     layout: this.renderPipeline!.getBindGroupLayout(group),
  //     entries: [
  //       {
  //         binding: 0,
  //         resource,
  //       },
  //     ],
  //   });

  //   return this.createResource(type, [resource], bindGroup, group);
  // }

  // addResource(
  //   type: PipelineResourceType,
  //   resources: GPUBindingResource[],
  //   bindGroup: GPUBindGroup,
  //   group = this.requestGroupIndex(type)
  // ) {
  //   const resource = new PipelineResource(resources, bindGroup, group);
  //   let index = 0;

  //   if (this.resources.has(type)) {
  //     const resourceArr = this.resources.get(type)!;
  //     resourceArr.push(resource);
  //     index = resourceArr.length - 1;
  //   } else this.resources.set(type, [resource]);

  //   return index;
  // }

  addResourceInstance(manager: GameManager, type: PipelineResourceType) {
    if (this.resourceTemplates.has(type)) {
      const resourceTemplate = this.resourceTemplates.get(type)!;
      const newInstance = resourceTemplate.createInstance(manager, this.renderPipeline!);

      const instanceArray = this.resourceInstances.get(type)!;
      instanceArray.push(newInstance);
      return instanceArray.length - 1;
    } else throw new Error("Pipeline does not use resource type");
  }
}
