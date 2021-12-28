import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { PipelineResourceTemplate } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { GroupType } from "../../../../common/GroupType";

export class TextureResource extends PipelineResourceTemplate {
  texture: Texture;
  textureBind: number;
  samplerBind: number;

  constructor(texture: Texture) {
    super();
    this.texture = texture;
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    this.samplerBind = pipeline.bindingIndex(GroupType.Diffuse);
    this.textureBind = pipeline.bindingIndex(GroupType.Diffuse);

    return pipeline.groupIndex(GroupType.Diffuse);
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 1;
  }

  getResourceHeader<T extends Defines<T>>(pipeline: Pipeline<T>) {
    // prettier-ignore
    return `
    ${pipeline.defines.diffuse && `
    [[group(${this.group}), binding(${this.samplerBind})]] var mySampler: sampler;
    [[group(${this.group}), binding(${this.textureBind})]] var myTexture: texture_2d<f32>;
    `}`;
  }

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    const bindGroup = manager.device.createBindGroup({
      label: "diffuse",
      layout: pipeline.getBindGroupLayout(this.group),
      entries: [
        {
          binding: this.samplerBind,
          resource: manager.samplers[0],
        },
        {
          binding: this.textureBind,
          resource: this.texture!.gpuTexture.createView(),
        },
      ],
    });

    return new PipelineResourceInstance(this.group, bindGroup);
  }
}
