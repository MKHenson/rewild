import { shader } from "../shader-lib/Utils";
import { ResourceType } from "../../../../common/ResourceType";
import type { DebugDefines } from "./DebugPipeline";

// prettier-ignore
export const vertexShader = shader<DebugDefines>`
${e => e.getTemplateByType(ResourceType.Transform)!.template.vertexBlock }

struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vFragUV : vec2<f32>,
    @location(1) vNormal : vec3<f32>,
    @location(2) vViewPosition : vec3<f32>
};

@stage(vertex)
fn main(@location(0) pos: vec4<f32>, @location(1) norm: vec3<f32>, @location(2) uv: vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    mvPosition = uniforms.modelViewMatrix * mvPosition;

    output.vViewPosition = - mvPosition.xyz;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv * vec2<f32>(${ e => e.defines.uvScaleX || '1.0'}, ${ e => e.defines.uvScaleY || '1.0'});

    var transformedNormal = uniforms.normalMatrix * norm.xyz;
    output.vNormal = normalize( transformedNormal );

    return output;
}
`;
