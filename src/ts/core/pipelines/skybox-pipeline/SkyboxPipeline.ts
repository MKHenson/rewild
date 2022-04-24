import { GameManager } from "../../GameManager";
import { Texture } from "../../textures/Texture";
import { Pipeline } from "../Pipeline";
import { TextureResource } from "../resources/TextureResource";
import { TransformResource, TransformType } from "../resources/TransformResource";
import { shaderBuilder } from "../shader-lib/Utils";
import { fragmentShader } from "./SkyboxPipelineFS";
import { vertexShader } from "./SkyboxPipelineVS";

export interface SkyboxDefines {
  diffuseMap?: Texture;
}

export class SkyboxPipeline extends Pipeline<SkyboxDefines> {
  constructor(name: string, defines: SkyboxDefines) {
    super(name, vertexShader, fragmentShader, defines);
  }

  onAddResources(): void {
    const transformResource = new TransformResource(
      TransformType.Projection | TransformType.ModelView | TransformType.Model
    );
    this.addTemplate(transformResource);

    if (this.defines.diffuseMap) {
      const resource = new TextureResource(this.defines.diffuseMap, "diffuse");
      this.addTemplate(resource);
    }
  }

  build(gameManager: GameManager): void {
    super.build(gameManager);

    // Build the shaders - should go after adding the resources as we might use those in the shader source
    const vertSource = shaderBuilder(this.vertexSource, this);
    const fragSource = shaderBuilder(this.fragmentSource, this);

    this.renderPipeline = gameManager.device.createRenderPipeline({
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
        frontFace: "cw",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: false,
        depthCompare: "less",
      },
      multisample: {
        count: 4,
      },
      label: "Skybox Pipeline",
      vertex: {
        module: gameManager.device.createShaderModule({
          code: vertSource,
        }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x3",
                offset: 0,
              },
            ],
          },
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
            attributes: [
              {
                shaderLocation: 1,
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
