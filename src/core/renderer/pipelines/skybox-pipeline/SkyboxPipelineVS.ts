import { shader } from "../shader-lib/Utils";
import { ResourceType } from "rewild-common";
import type { SkyboxDefines } from "./SkyboxPipeline";

// prettier-ignore
export const vertexShader = shader<SkyboxDefines>`
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

@vertex
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
