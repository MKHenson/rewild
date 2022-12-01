import { Texture } from "../../textures/Texture";
import { Pipeline } from "../Pipeline";
import { LightingResource } from "../resources/LightingResource";
import { MaterialResource } from "../resources/MaterialResource";
import { TextureResource } from "../resources/TextureResource";
import { TransformResource, TransformType } from "../resources/TransformResource";
import { vertexShader } from "./DebugPipelineVS";
import { fragmentShader } from "./DebugPipelineFS";
import { VertexBufferLayout } from "../VertexBufferLayout";
import { VertexAttribute } from "../VertexAttribute";
import { AttributeType } from "../../../../common/AttributeType";

export interface DebugDefines {
  uvScaleX?: string;
  uvScaleY?: string;
  diffuseMap?: Texture;
  normalMap?: Texture;
  metalnessMap?: Texture;
  roughnessMap?: Texture;
  NUM_DIR_LIGHTS: number;
}

export class DebugPipeline extends Pipeline<DebugDefines> {
  constructor(name: string, defines: DebugDefines) {
    super(name, vertexShader, fragmentShader, defines);

    this.vertexLayouts = [
      new VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [
        new VertexAttribute(AttributeType.POSITION, 0, "float32x3", 0),
      ]),
      new VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 3, [
        new VertexAttribute(AttributeType.NORMAL, 1, "float32x3", 0),
      ]),
      new VertexBufferLayout(Float32Array.BYTES_PER_ELEMENT * 2, [
        new VertexAttribute(AttributeType.UV, 2, "float32x2", 0),
      ]),
    ];
  }

  onAddResources(): void {
    const transformResource = new TransformResource(
      TransformType.Projection | TransformType.ModelView | TransformType.Normal
    );
    this.addResourceTemplate(transformResource);

    const materialResource = new MaterialResource();
    this.addResourceTemplate(materialResource);

    const lightingResource = new LightingResource();
    this.addResourceTemplate(lightingResource);

    if (this.defines.diffuseMap) {
      const resource = new TextureResource(this.defines.diffuseMap, "diffuse");
      this.addResourceTemplate(resource);
    }

    if (this.defines.normalMap) {
      const resource = new TextureResource(this.defines.normalMap, "normal");
      this.addResourceTemplate(resource);
    }
  }
}
