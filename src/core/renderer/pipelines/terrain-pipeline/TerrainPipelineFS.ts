import { ResourceType } from 'rewild-common';
import { shader } from '../shader-lib/Utils';
import type { TerrainDefines } from './TerrainPipeline';

// prettier-ignore
export const fragmentShader = shader<TerrainDefines>`
${e => e.defines.diffuseMap ? e.getTemplateByType(ResourceType.Texture, 'diffuse')!.template.fragmentBlock : ''}

@fragment
fn main( 
  @location(0) vFragUV: vec2<f32> 
) -> @location(0) vec4<f32> {
  var diffuseColor = vec4<f32>( 1.0, 1.0, 1.0, 1.0 );

  ${e => e.defines.diffuseMap &&
  `var texelColor = textureSample(diffuseTexture, diffuseSampler, vFragUV);
  diffuseColor = diffuseColor * texelColor;`}

  return vec4<f32>( 1.0, 1.0, 1.0, 1.0) * diffuseColor;
}
`;
