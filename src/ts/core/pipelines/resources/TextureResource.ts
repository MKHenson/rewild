import { GameManager } from "../../GameManager";
import { Texture } from "../../Texture";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/Utils";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";

export class TextureResource extends PipelineResourceTemplate {
  texture: Texture;
  textureBind: number;
  samplerBind: number;

  constructor(texture: Texture, id: string) {
    super(GroupType.Material, ResourceType.Texture, id);
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
      ${pipeline.defines.diffuseMap && `
      @group(${group}) @binding(${this.samplerBind})
      var ${this.id}Sampler: sampler;
      @group(${group}) @binding(${this.textureBind})
      var ${this.id}Texture: texture_2d<f32>;`
      }`,
      vertexBlock: null,
    };
  }

  getBindingData(manager: GameManager, pipeline: GPURenderPipeline): BindingData {
    return {
      binds: [
        {
          binding: this.samplerBind,
          resource: manager.samplers[0],
        },
        {
          binding: this.textureBind,
          resource: this.texture!.gpuTexture.createView(),
        },
      ],
      buffer: null,
    };
  }
}
