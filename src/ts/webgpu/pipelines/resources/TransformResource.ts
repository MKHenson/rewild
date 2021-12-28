import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { GroupType } from "../../../../common/GroupType";

export class TransformResource extends PipelineResourceTemplate {
  binding: number;

  constructor() {
    super();
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.binding = curBindIndex;
    const group = pipeline.groupIndex(GroupType.Transform);

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

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    const SIZEOF_MATRICES = UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + UNIFORM_TYPES_MAP["mat3x3<f32>"];

    const buffer = manager.device.createBuffer({
      label: "transform",
      size: SIZEOF_MATRICES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = manager.device.createBindGroup({
      label: "transform",
      layout: pipeline.getBindGroupLayout(this.template.group),
      entries: [
        {
          binding: this.binding,
          resource: {
            buffer: buffer,
            offset: 0,
            size: SIZEOF_MATRICES,
          },
        },
      ],
    });

    return new PipelineResourceInstance(this.template.group, bindGroup, buffer);
  }
}
