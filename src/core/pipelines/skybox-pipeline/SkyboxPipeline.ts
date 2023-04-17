import { Texture } from "../../textures/Texture";
import { Pipeline } from "../Pipeline";
import { TextureResource } from "../resources/TextureResource";
import { TransformResource, TransformType } from "../resources/TransformResource";
import { VertexAttribute } from "../VertexAttribute";
import { VertexBufferLayout } from "../VertexBufferLayout";
import { fragmentShader } from "./SkyboxPipelineFS";
import { vertexShader } from "./SkyboxPipelineVS";
import { AttributeType } from "rewild-common";

export interface SkyboxDefines {
  diffuseMap?: Texture;
}

export class SkyboxPipeline extends Pipeline<SkyboxDefines> {
  constructor(name: string, defines: SkyboxDefines) {
    super(name, vertexShader, fragmentShader, defines);
    this.frontFace = "cw";
    this.depthCompare = "less";
    this.depthWriteEnabled = false;

    this.vertexLayouts = [
      new VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [
        new VertexAttribute(AttributeType.POSITION, 0, "float32x3", 0),
      ]),
      new VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 2, [
        new VertexAttribute(AttributeType.UV, 1, "float32x2", 0),
      ]),
    ];
  }

  onAddResources(): void {
    const transformResource = new TransformResource(
      TransformType.Projection | TransformType.ModelView | TransformType.Model
    );
    this.addResourceTemplate(transformResource);

    if (this.defines.diffuseMap) {
      const resource = new TextureResource(this.defines.diffuseMap, "diffuse");
      this.addResourceTemplate(resource);
    }
  }
}
