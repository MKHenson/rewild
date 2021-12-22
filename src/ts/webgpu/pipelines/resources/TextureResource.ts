import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";

export class TextureResource extends PipelineResourceTemplate {
  texture: Texture;

  constructor(texture: Texture, group: number, binding: number) {
    super(group, binding);
    this.texture = texture;
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): number {
    return 1;
  }

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    const bindGroup = manager.device.createBindGroup({
      label: "diffuse",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: this.binding,
          resource: manager.samplers[0],
        },
        {
          binding: this.binding + 1,
          resource: this.texture!.gpuTexture.createView(),
        },
      ],
    });

    return new PipelineResourceInstance(this.group, bindGroup);
  }
}
