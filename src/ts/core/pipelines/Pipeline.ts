import { GameManager } from "../GameManager";
import { BindingData, PipelineResourceTemplate } from "./resources/PipelineResourceTemplate";
import { PipelineResourceInstance } from "./resources/PipelineResourceInstance";
import { GroupType } from "../../../common/GroupType";
import { ResourceType } from "../../../common/ResourceType";
import "./shader-lib/Utils";
import { Defines, shaderBuilder, SourceFragments } from "./shader-lib/Utils";
import { VertexBufferLayout } from "./VertexBufferLayout";

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
  groupInstances: Map<GroupType, PipelineResourceInstance[]>;
  rebuild: boolean;

  groupMapping: Map<GroupType, GroupMapping>;
  private groups: number;

  topology: GPUPrimitiveTopology;
  cullMode: GPUCullMode;
  frontFace: GPUFrontFace;
  depthFormat: GPUTextureFormat;
  depthWriteEnabled: boolean;
  depthCompare: GPUCompareFunction;
  vertexLayouts: VertexBufferLayout[];

  constructor(name: string, vertexSource: SourceFragments<T>, fragmentSource: SourceFragments<T>, defines: Defines<T>) {
    this.name = name;
    this.renderPipeline = null;
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.resourceTemplates = [];
    this.groupInstances = new Map();
    this.defines = defines;
    this.rebuild = true;

    this.groupMapping = new Map();
    this.groups = 0;

    this.topology = "triangle-list";
    this.cullMode = "back";
    this.frontFace = "ccw";
    this.depthFormat = "depth24plus";
    this.depthWriteEnabled = true;
    this.depthCompare = "less";
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

  getTemplateByType(type: ResourceType, id?: string) {
    if (id) return this.resourceTemplates.find((t) => t.resourceType === type && id === t.id);
    else return this.resourceTemplates.find((t) => t.resourceType === type);
  }

  getTemplateByGroup(type: GroupType) {
    return this.resourceTemplates.find((t) => t.groupType === type);
  }

  addResourceTemplate(template: PipelineResourceTemplate) {
    this.resourceTemplates.push(template);
    return this;
  }

  build(gameManager: GameManager): void {
    this.rebuild = false;

    const groupInstanceMap = this.groupInstances;
    const templates = this.resourceTemplates;

    // Destroy previous instances
    templates.forEach((template) => {
      const resourceInstances = groupInstanceMap.get(template.groupType);
      resourceInstances?.forEach((i) => {
        i.dispose();
      });
    });

    // Reset
    templates.splice(0, templates.length);
    this.groupMapping.clear();
    this.groups = 0;

    this.onAddResources();

    let curBinding = 0;
    const binds: Map<number, number> = new Map();

    templates.forEach((resourceTemplate) => {
      const groupIndex = this.groupIndex(resourceTemplate.groupType);
      if (!binds.has(groupIndex)) binds.set(groupIndex, 0);

      curBinding = binds.get(groupIndex)!;

      const template = resourceTemplate.build(gameManager, this, curBinding);

      curBinding += template.bindings.length;
      binds.set(groupIndex, curBinding);

      resourceTemplate.template = template;
    });

    // Build the shaders - should go after adding the resources as we might use those in the shader source
    const vertSource = shaderBuilder(this.vertexSource, this);
    const fragSource = shaderBuilder(this.fragmentSource, this);

    this.renderPipeline = gameManager.device.createRenderPipeline({
      layout: "auto",
      primitive: {
        topology: this.topology,
        cullMode: this.cullMode,
        frontFace: this.frontFace,
      },
      depthStencil: {
        format: this.depthFormat,
        depthWriteEnabled: this.depthWriteEnabled,
        depthCompare: this.depthCompare,
      },
      multisample: {
        count: 4,
      },
      label: this.name,
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource,
        }),
        entryPoint: "main",
        buffers: this.vertexLayouts.map(
          (layout) =>
            ({
              arrayStride: layout.arrayStride,
              stepMode: layout.stepMode,
              attributes: layout.attributes,
            } as GPUVertexBufferLayout)
        ),
      },
      fragment: {
        module: gameManager.device.createShaderModule({
          code: fragSource,
        }),
        entryPoint: "main",
        targets: [{ format: gameManager.format }],
      },
    });
  }

  initialize(gameManager: GameManager): void {
    const templates = this.resourceTemplates;
    const groupInstances = this.groupInstances;
    const prevGroupKeys = Array.from(this.groupInstances.keys());
    const uniqueNewGroupKeys = templates
      .map((r) => r.groupType)
      .filter((value, index, self) => self.indexOf(value) === index);
    const groupCache: Map<GroupType, { numInstances: number; bindData: Map<number, BindingData[]> }> = new Map();

    // Remove any unused instances
    prevGroupKeys.forEach((key) => {
      if (!uniqueNewGroupKeys.includes(key)) groupInstances.delete(key);
    });

    // Initialize temp cache maps
    for (const newKey of uniqueNewGroupKeys) {
      let numInstancesToCreate = 0;
      let instances: PipelineResourceInstance[];

      // If we previously had instances, then save the number of them
      // as we have to re-create the same amount as before. Otherwise just create 1;
      if (groupInstances.has(newKey)) {
        instances = groupInstances.get(newKey)!;
        numInstancesToCreate = instances.length;
        instances.splice(0, instances.length);
      } else {
        numInstancesToCreate = 1;
        instances = [];
        groupInstances.set(newKey, instances);
      }

      groupCache.set(newKey, { bindData: new Map(), numInstances: numInstancesToCreate });
    }

    // Initialize each template
    templates.forEach((resourceTemplate) => {
      const { bindData, numInstances } = groupCache.get(resourceTemplate.groupType)!;

      for (let i = 0; i < numInstances; i++)
        if (bindData.has(i)) {
          bindData.get(i)!.push(resourceTemplate.getBindingData(gameManager, this.renderPipeline!));
        } else {
          bindData.set(i, [resourceTemplate.getBindingData(gameManager, this.renderPipeline!)]);
        }
    });

    // Create the instances & bind groups
    groupCache.forEach((cache, groupType) => {
      const instances: PipelineResourceInstance[] = new Array(cache.numInstances);
      const groupIndex = this.groupIndex(groupType);

      for (let i = 0; i < cache.numInstances; i++) {
        let buffers: GPUBuffer[] | null = null;

        // Join all the entries from each template
        // Also join all the collect each of the buffers we want to cache for the render queue
        const entries: GPUBindGroupEntry[] = cache.bindData.get(i)!.reduce((accumulator, cur) => {
          if (cur.buffer) {
            if (!buffers) buffers = [cur.buffer];
            else buffers.push(cur.buffer);
          }

          accumulator.push(...cur.binds);
          return accumulator;
        }, [] as GPUBindGroupEntry[]);

        const bindGroup = gameManager.device.createBindGroup({
          label: GroupType[groupType],
          layout: this.renderPipeline!.getBindGroupLayout(groupIndex),
          entries,
        });

        instances[i] = new PipelineResourceInstance(groupIndex, bindGroup, buffers);
      }

      groupInstances.set(groupType, instances);
    });
  }

  addResourceInstance(manager: GameManager, type: GroupType) {
    const template = this.getTemplateByGroup(type);

    if (template) {
      const bindingData = template.getBindingData(manager, this.renderPipeline!);
      const groupIndex = this.groupIndex(type);

      const bindGroup = manager.device.createBindGroup({
        label: GroupType[type],
        layout: this.renderPipeline!.getBindGroupLayout(groupIndex),
        entries: bindingData.binds,
      });

      const instances = new PipelineResourceInstance(
        groupIndex,
        bindGroup,
        bindingData.buffer ? [bindingData.buffer] : null
      );

      const instanceArray = this.groupInstances.get(type)!;
      instanceArray.push(instances);
      return instanceArray.length - 1;
    } else throw new Error("Pipeline does not use resource type");
  }
}
