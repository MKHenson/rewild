import { GameManager } from "../../gameManager";

export abstract class PipelineResource {
  bindGroup: GPUBindGroup;
  group: number;
  binding: number;
  transient: boolean;

  constructor(group: number, binding: number, transient: boolean) {
    this.group = group;
    this.binding = binding;
    this.transient = transient;
  }

  abstract initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup;
  abstract clone(): PipelineResource;

  dispose(): void {}
}
