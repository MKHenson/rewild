import { GameManager } from "../../GameManager";
import { Texture } from "../../textures/Texture";
import { defaultPipelineDescriptor } from "../shader-lib/DefaultPipelineDescriptor";
import { Pipeline } from "../Pipeline";
import { LightingResource } from "../resources/LightingResource";
import { MaterialResource } from "../resources/MaterialResource";
import { TextureResource } from "../resources/TextureResource";
import { TransformResource, TransformType } from "../resources/TransformResource";
import { shaderBuilder } from "../shader-lib/Utils";
import { vertexShader } from "./DebugPipelineVS";
import { fragmentShader } from "./DebugPipelineFS";

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
  }

  onAddResources(): void {
    const transformResource = new TransformResource(
      TransformType.Projection | TransformType.ModelView | TransformType.Normal
    );
    this.addTemplate(transformResource);

    const materialResource = new MaterialResource();
    this.addTemplate(materialResource);

    const lightingResource = new LightingResource();
    this.addTemplate(lightingResource);

    if (this.defines.diffuseMap) {
      const resource = new TextureResource(this.defines.diffuseMap, "diffuse");
      this.addTemplate(resource);
    }

    if (this.defines.normalMap) {
      const resource = new TextureResource(this.defines.normalMap, "normal");
      this.addTemplate(resource);
    }
  }

  build(gameManager: GameManager): void {
    super.build(gameManager);

    // Build the shaders - should go after adding the resources as we might use those in the shader source
    const vertSource = shaderBuilder(this.vertexSource, this);
    const fragSource = shaderBuilder(this.fragmentSource, this);

    this.renderPipeline = gameManager.device.createRenderPipeline({
      ...defaultPipelineDescriptor,
      label: "Debug Pipeline",
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource,
        }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3, // (3 + 2)
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x3",
                offset: 0,
              },
              // {
              //   shaderLocation: 1,
              //   format: "float32x3",
              //   offset: 12,
              // },
            ],
          },
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
              {
                shaderLocation: 1,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
            attributes: [
              {
                shaderLocation: 2,
                format: "float32x2",
                offset: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: gameManager.device.createShaderModule({
          code: fragSource,
        }),
        entryPoint: "main",
        targets: [{ format: gameManager.format }],
      },
    });
  }
}
