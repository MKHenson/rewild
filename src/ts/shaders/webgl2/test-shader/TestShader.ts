import { Shader } from "../../Shader";
import fragSrc from "./frag.fs";
import vertSrc from "./vertex.vs";

export class TestShader extends Shader {
  colors: number[];
  constructor(colors: number[]) {
    super("Test", vertSrc, fragSrc);
    this.colors = colors;
    this.doBlending = false;
  }

  compile(gl: WebGL2RenderingContext) {
    super.compile(gl);

    // Our shader uses custom uniforms
    const uColor = gl.getUniformLocation(this.program!, "uColor");
    gl.uniform3fv(uColor, this.colors);
    gl.getUniformLocation(this.program!, "uColor");
  }
}
