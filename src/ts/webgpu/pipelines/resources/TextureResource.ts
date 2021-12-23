import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { PipelineResourceType } from "../../../../common/PipelineResourceType";

export class TextureResource extends PipelineResourceTemplate {
  texture: Texture;

  constructor(texture: Texture, group: number, binding: number) {
    super(group, binding);
    this.texture = texture;
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 1;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    // prettier-ignore
    return `
    ${pipeline.defines.diffuse && `
    [[group(${pipeline.groupIndex(PipelineResourceType.Diffuse)}), binding(0)]] var mySampler: sampler;
    [[group(${pipeline.groupIndex(PipelineResourceType.Diffuse)}), binding(1)]] var myTexture: texture_2d<f32>;
    `}`;
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
