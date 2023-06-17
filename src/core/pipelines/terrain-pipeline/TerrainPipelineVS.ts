import { shader } from "../shader-lib/Utils";
import { ResourceType } from "rewild-common";
import type { TerrainDefines } from "./TerrainPipeline";

// prettier-ignore
export const vertexShader = shader<TerrainDefines>`
${e => e.getTemplateByType(ResourceType.Transform)!.template.vertexBlock }

struct Output {
    @builtin(position) Position : vec4<f32>,
    @location(0) vFragUV : vec2<f32>
};

@vertex
fn main(@location(0) pos: vec4<f32>, @location(1) uv : vec2<f32>) -> Output {
    var output: Output;
    var mvPosition = vec4<f32>( pos.xyz, 1.0 );

    mvPosition = uniforms.modelViewMatrix * mvPosition;
    output.Position = uniforms.projMatrix * mvPosition;
    output.vFragUV = uv;

    return output;
}
`;
