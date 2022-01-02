import { GameManager } from "../../gameManager";
import { Texture } from "../../GPUTexture";
import { PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { PipelineResourceInstance } from "./PipelineResourceInstance";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/utils";
import { GroupType } from "../../../../common/GroupType";

export class TextureResource extends PipelineResourceTemplate {
  texture: Texture;
  textureBind: number;
  samplerBind: number;

  constructor(texture: Texture) {
    super(GroupType.Diffuse);
    this.texture = texture;
  }

  build<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>, curBindIndex: number): Template {
    this.samplerBind = curBindIndex;
    this.textureBind = curBindIndex + 1;
    const group = pipeline.groupIndex(this.groupType);

    // prettier-ignore
    return {
      group,
      bindings: [manager.samplers[0], this.texture!.gpuTexture.createView()],
      fragmentBlock: `
      ${pipeline.defines.diffuse && `
      [[group(${group}), binding(${this.samplerBind})]] var mySampler: sampler;
      [[group(${group}), binding(${this.textureBind})]] var myTexture: texture_2d<f32>;`
      }`,
      vertexBlock: null,
    };
  }

  initialize<T extends Defines<T>>(manager: GameManager, pipeline: Pipeline<T>): number {
    return 1;
  }

  createInstance(manager: GameManager, pipeline: GPURenderPipeline): PipelineResourceInstance {
    const bindGroup = manager.device.createBindGroup({
      label: "diffuse",
      layout: pipeline.getBindGroupLayout(this.template.group),
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

    return new PipelineResourceInstance(this.template.group, bindGroup);
  }
}
