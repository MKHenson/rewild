import { GameManager } from "../gameManager";
import { PipelineResource } from "./resources/PipelineResource";
import { PipelineResourceType } from "../../../common/PipelineResourceType";
import "./shader-lib/utils";
import { Defines, SourceFragments } from "./shader-lib/utils";

export abstract class Pipeline<T extends Defines<T>> {
  name: string;
  renderPipeline: GPURenderPipeline | null;
  fragmentSource: SourceFragments<T>;
  vertexSource: SourceFragments<T>;
  private _defines: Defines<T>;
  resources: Map<PipelineResourceType, PipelineResource[]>;
  rebuild: boolean;

  groupMapping: Map<PipelineResourceType, number>;
  private groups: number;

  constructor(name: string, vertexSource: SourceFragments<T>, fragmentSource: SourceFragments<T>, defines: Defines<T>) {
    this.name = name;
    this.renderPipeline = null;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.resources = new Map();
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

  initialize(gameManager: GameManager): void {
    this.rebuild = false;

    const allResources = this.resources;
    const keys = Array.from(this.resources.keys());

    keys.forEach((key) => {
      const resources = allResources.get(key)!;
      let clones: PipelineResource[] | null = null;

      resources.forEach((r) => {
        r.dispose();

        if (!clones && r.transient) clones = [];
        if (r.transient) clones!.push(r.clone());

        return r.transient;
      });

      if (clones) allResources.set(key, clones);
      else allResources.delete(key);
    });
  }

  build(gameManager: GameManager): void {
    this.resources.forEach((resources) => {
      resources.forEach((resource) => {
        resource.bindGroup = resource.initialize(gameManager, this.renderPipeline!);
      });
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

  addResource(type: PipelineResourceType, resource: PipelineResource) {
    let index = 0;

    if (this.resources.has(type)) {
      const resourceArr = this.resources.get(type)!;
      resourceArr.push(resource);
      index = resourceArr.length - 1;
    } else this.resources.set(type, [resource]);

    return index;
  }
}
