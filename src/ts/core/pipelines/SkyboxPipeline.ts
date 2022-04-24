import { ResourceType } from "../../../common/ResourceType";
import { GameManager } from "../GameManager";
import { Texture } from "../textures/Texture";
import { Pipeline } from "./Pipeline";
import { TextureResource } from "./resources/TextureResource";
import { TransformResource, TransformType } from "./resources/TransformResource";
import { shader, shaderBuilder } from "./shader-lib/Utils";

// prettier-ignore
const vertexShader = shader<Defines>`
${e => e.getTemplateByType(ResourceType.Transform)!.template.vertexBlock }

struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vFragUV : vec2<f32>,
    @location(1) vViewPosition : vec3<f32>,
    @location(2) vWorldDirection : vec3<f32>
};

fn transformDirection( dir: vec3<f32>, matrix: mat4x4<f32> ) -> vec3<f32> {
  return normalize( ( matrix * vec4<f32>( dir, 0.0 ) ).xyz );
}

@stage(vertex)
fn main(@location(0) pos: vec4<f32>, @location(1) uv: vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    output.vWorldDirection = transformDirection( pos.xyz, uniforms.modelMatrix );

    mvPosition = uniforms.modelViewMatrix * mvPosition;

    output.vViewPosition = - mvPosition.xyz;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv;

    return output;
}
`;

// prettier-ignore
const fragmentShader = shader<Defines>`

${e => e.defines.diffuseMap ? e.getTemplateByType(ResourceType.Texture, 'diffuse')!.template.fragmentBlock : ''}

@stage(fragment)
fn main(
  @location(0) vFragUV: vec2<f32>,
  @location(1) vViewPosition : vec3<f32>,
  @location(2) vWorldDirection : vec3<f32>
) -> @location(0) vec4<f32> {

  var diffuseColor = vec4<f32>( 1.0, 1.0, 1.0, 1.0 );
  var vReflect = vWorldDirection;

  ${e => e.defines.diffuseMap &&
  `var texelColor = textureSample(diffuseTexture, diffuseSampler, vec3<f32>( vReflect.x, vReflect.yz ));
  diffuseColor = diffuseColor * texelColor;`}

  return vec4<f32>( diffuseColor.xyz, 1.0);
}
`;

interface Defines {
  diffuseMap?: Texture;
}

export class SkyboxPipeline extends Pipeline<Defines> {
  constructor(name: string, defines: Defines) {
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
