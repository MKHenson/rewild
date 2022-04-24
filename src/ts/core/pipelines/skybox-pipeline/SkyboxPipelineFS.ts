import { shader } from "../shader-lib/Utils";
import { ResourceType } from "../../../../common/ResourceType";
import type { SkyboxDefines } from "./SkyboxPipeline";

// prettier-ignore
export const fragmentShader = shader<SkyboxDefines>`

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
