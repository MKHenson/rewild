import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { PipelineResource } from "./PipelineResource";

export class TextureResource extends PipelineResource {
  texture: Texture;

  constructor(texture: Texture, group: number, binding: number, transient = false) {
    super(group, binding, transient);
    this.texture = texture;
  }

  initialize(manager: GameManager, pipeline: GPURenderPipeline): GPUBindGroup {
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

    return bindGroup;
  }

  clone(): PipelineResource {
    return new TextureResource(this.texture, this.group, this.binding);
  }
}
