import { Renderer } from "../../../renderer/Renderer";
import { UNIFORM_TYPES_MAP } from "./MemoryUtils";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/Utils";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";

export enum TransformType {
  Projection = 1,
  ModelView = 2,
  Model = 4,
  Normal = 8,
}

export class TransformResource extends PipelineResourceTemplate {
  binding: number;
  transformType: TransformType;

  projectionOffset: number;
  modelViewOffset: number;
  modelOffset: number;
  normalOffset: number;

  constructor(transformType: TransformType) {
    super(GroupType.Transform, ResourceType.Transform);
    this.transformType = transformType;
    this.projectionOffset = -1;
    this.modelViewOffset = -1;
    this.modelOffset = -1;
    this.normalOffset = -1;
  }

  getBufferSize() {
    const requiresProjection = this.transformType & TransformType.Projection;
    const requiresModelView = this.transformType & TransformType.ModelView;
    const requiresModel = this.transformType & TransformType.Model;
    const requiresNormal = this.transformType & TransformType.Normal;

    // prettier-ignore
    return (requiresProjection ? UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + 
      (requiresModelView ? UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + 
      (requiresModel ? UNIFORM_TYPES_MAP["mat4x4<f32>"] : 0) + 
      (requiresNormal ? UNIFORM_TYPES_MAP["mat3x3<f32>"] : 0);
  }

  build<T extends Defines<T>>(renderer: Renderer, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);

    const requiresProjection = this.transformType & TransformType.Projection;
    const requiresModelView = this.transformType & TransformType.ModelView;
    const requiresModel = this.transformType & TransformType.Model;
    const requiresNormal = this.transformType & TransformType.Normal;

    this.projectionOffset = -1;
    this.modelViewOffset = -1;
    this.modelOffset = -1;
    this.normalOffset = -1;

    let curOffset = 0;
    if (requiresProjection) {
      this.projectionOffset = curOffset;
      curOffset += UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }
    if (requiresModelView) {
      this.modelViewOffset = curOffset;
      curOffset += UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }
    if (requiresModel) {
      this.modelOffset = curOffset;
      curOffset += UNIFORM_TYPES_MAP["mat4x4<f32>"];
    }
    if (requiresNormal) {
      this.normalOffset = curOffset;
      curOffset += UNIFORM_TYPES_MAP["mat3x3<f32>"];
    }

    const SIZEOF_MATRICES = this.getBufferSize();

    const buffer = renderer.device.createBuffer({
      label: "transform",
      size: SIZEOF_MATRICES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return {
      group,
      bindings: [
        {
          buffer,
        },
      ],
      fragmentBlock: null,
      // prettier-ignore
      vertexBlock: `
      struct TransformUniform {
        ${requiresProjection ? 'projMatrix: mat4x4<f32>,': ''}
        ${requiresModelView ? 'modelViewMatrix: mat4x4<f32>,': '' }
        ${requiresModel ? 'modelMatrix: mat4x4<f32>,' : ''}
        ${requiresNormal ? 'normalMatrix: mat3x3<f32>' : ''}
      };
      @group(${group}) @binding(${curBindIndex})
      var<uniform> uniforms: TransformUniform;
      `,
    };
  }

  getBindingData(renderer: Renderer, pipeline: GPURenderPipeline): BindingData {
    const SIZEOF_MATRICES = this.getBufferSize();

    const buffer = renderer.device.createBuffer({
      label: "transform",
      size: SIZEOF_MATRICES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return {
      binds: [
        {
          binding: this.binding,
          resource: {
            buffer: buffer,
            offset: 0,
            size: SIZEOF_MATRICES,
          },
        },
      ],
      buffer,
    };
  }
}
