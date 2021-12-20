import { GameManager } from "../../gameManager";
import { UNIFORM_TYPES_MAP } from "./memoryUtils";
import { PipelineResource } from "./PipelineResource";

export class ProjectionResource extends PipelineResource {
  // There is only 1 buffer and its shared by the resource instances
  static buffer: GPUBuffer;
  static resource: GPUBindingResource;

  constructor(group: number, binding: number = 0) {
    super(group, binding, true);
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup {
    const SIZEOF_MATRICES = UNIFORM_TYPES_MAP["mat4x4<f32>"];

    if (!ProjectionResource.buffer) {
      ProjectionResource.buffer = manager.device.createBuffer({
        label: "perspective",
        size: SIZEOF_MATRICES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      ProjectionResource.resource = {
        buffer: ProjectionResource.buffer,
        offset: 0,
        size: SIZEOF_MATRICES,
      };
    }

    const bindGroup = manager.device.createBindGroup({
      label: "perspective",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: this.binding,
          resource: ProjectionResource.resource,
        },
      ],
    });

    return bindGroup;
  }

  clone(): PipelineResource {
    return new ProjectionResource(this.group, this.binding);
  }

  dispose() {
    super.dispose();
  }
}
