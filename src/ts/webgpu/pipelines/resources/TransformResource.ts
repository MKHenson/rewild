import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResource } from "./PipelineResource";

export class TransformResource extends PipelineResource {
  buffer: GPUBuffer;

  constructor(group: number, binding: number = 0) {
    super(group, binding, true);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup {
    const SIZEOF_MATRICES = UNIFORM_TYPES_MAP["mat4x4<f32>"] * 2 + UNIFORM_TYPES_MAP["mat3x3<f32>"];

    this.buffer = manager.device.createBuffer({
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
            buffer: this.buffer,
            offset: 0,
            size: SIZEOF_MATRICES,
          },
        },
      ],
    });

    return bindGroup;
  }

  clone(): PipelineResource {
    return new TransformResource(this.group, this.binding);
  }

  dispose() {
    super.dispose();
    this.buffer?.destroy();
  }
}
