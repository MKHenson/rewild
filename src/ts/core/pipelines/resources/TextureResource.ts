import { GameManager } from "../../GameManager";
import { Texture } from "../../textures/Texture";
import { BindingData, PipelineResourceTemplate, Template } from "./PipelineResourceTemplate";
import { Pipeline } from "../Pipeline";
import { Defines } from "../shader-lib/Utils";
import { GroupType } from "../../../../common/GroupType";
import { ResourceType } from "../../../../common/ResourceType";
import { BitmapCubeTexture } from "../../textures/BitmapCubeTexture";

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

    const isCube = this.texture instanceof BitmapCubeTexture;

    // prettier-ignore
    return {
      group,
      bindings: [this.texture!.sampler.gpuSampler, this.texture!.gpuTexture.createView()],
      fragmentBlock: `
      ${pipeline.defines.diffuseMap && `
      @group(${group}) @binding(${this.samplerBind})
      var ${this.id}Sampler: sampler;
      @group(${group}) @binding(${this.textureBind})
      var ${this.id}Texture: ${ isCube ? 'texture_cube' : 'texture_2d'}<f32>;`
      }`,
      vertexBlock: null,
    };
  }

  getBindingData(manager: GameManager, pipeline: GPURenderPipeline): BindingData {
    const isCube = this.texture instanceof BitmapCubeTexture;
    const cubeTexture = this.texture as BitmapCubeTexture;

    return {
      binds: [
        {
          binding: this.samplerBind,
          resource: this.texture!.sampler.gpuSampler,
        },
        {
          binding: this.textureBind,
          resource: this.texture!.gpuTexture.createView({
            dimension: isCube ? "cube" : "2d",
            aspect: "all",
            label: isCube ? "Cube View Form" : "2D View Format",
            arrayLayerCount: isCube ? cubeTexture.src.length : undefined,
            baseArrayLayer: isCube ? 0 : undefined,
            baseMipLevel: 0,
          }),
        },
      ],
      buffer: null,
    };
  }
}
