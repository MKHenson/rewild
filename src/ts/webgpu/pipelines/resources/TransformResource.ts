import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export class TransformResource extends PipelineResourceTemplate {
  constructor(group: number, binding: number = 0) {
    super(group, binding);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): number {
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
      layout: pipeline.getBindGroupLayout(this.group),
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

    return new PipelineResourceInstance(this.group, bindGroup, buffer);
  }
}
