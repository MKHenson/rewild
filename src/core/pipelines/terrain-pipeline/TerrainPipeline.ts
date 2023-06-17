import { Pipeline } from "../Pipeline";
import { TransformResource, TransformType } from "../resources/TransformResource";
import { vertexShader } from "./TerrainPipelineVS";
import { fragmentShader } from "./TerrainPipelineFS";
import { VertexBufferLayout } from "../VertexBufferLayout";
import { VertexAttribute } from "../VertexAttribute";
import { AttributeType } from "rewild-common";
import { Texture } from "src/core/textures/Texture";
import { TextureResource } from "../resources/TextureResource";

export interface TerrainDefines {
  diffuseMap?: Texture;
}

export class TerrainPipeline extends Pipeline<TerrainDefines> {
  constructor(name: string, defines: TerrainDefines) {
    super(name, vertexShader, fragmentShader, defines);

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
      TransformType.Projection | TransformType.ModelView | TransformType.Normal
    );
    this.addResourceTemplate(transformResource);

    if (this.defines.diffuseMap) {
      const resource = new TextureResource(this.defines.diffuseMap, "diffuse");
      this.addResourceTemplate(resource);
    }
  }
}
