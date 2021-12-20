import { Shader } from "../../Shader";
import fragSrc from "./frag.fs";
import vertSrc from "./vertex.vs";

export class QuadShader extends Shader {
  constructor() {
    super("QuadShader", vertSrc, fragSrc);
    this.doBlending = true;
    this.cullingEnabled = false;
  }

  compile(gl: WebGL2RenderingContext) {
    super.compile(gl);
  }
}
