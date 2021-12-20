import { Shader } from "../../Shader";
import fragSrc from "./frag.fs";
import vertSrc from "./vertex.vs";

export class DebugShader extends Shader {
  constructor() {
    super("DebugShader", vertSrc, fragSrc);
    this.doBlending = true;
    this.cullingEnabled = false;
  }

  compile(gl: WebGL2RenderingContext) {
    super.compile(gl);
  }
}
