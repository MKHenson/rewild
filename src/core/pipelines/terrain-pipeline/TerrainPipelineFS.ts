import { shader } from "../shader-lib/Utils";
import type { TerrainDefines } from "./TerrainPipeline";

// prettier-ignore
export const fragmentShader = shader<TerrainDefines>`
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>( 1.0, 0, 0, 1.0);
}
`;
