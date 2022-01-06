import { GameManager } from "../../GameManager";
import { UNIFORM_TYPES_MAP } from "./MemoryUtils";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/Utils";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";

export class TransformResource extends PipelineResourceTemplate {
  binding: number;

  constructor() {
    super(GroupType.Transform, ResourceType.Transform);
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(this.groupType);

    const SIZEOF_MATRICES = UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + UNIFORM_TYPES_MAP["mat3x3<f32>"];

    const buffer = manager.device.createBuffer({
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
        projMatrix: mat4x4<f32>;
        modelViewMatrix: mat4x4<f32>;
        normalMatrix: mat3x3<f32>;
      };
      [[group(${group}), binding(${curBindIndex})]] var<uniform> uniforms: TransformUniform;
      `,
    };
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 0;
  }

  getBindingData(manager: GameManager, pipeline: GPURenderPipeline): BindingData {
    const SIZEOF_MATRICES = UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + UNIFORM_TYPES_MAP["mat3x3<f32>"];

    const buffer = manager.device.createBuffer({
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
