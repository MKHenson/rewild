import { bool } from "build/types";
import { Side } from "../../common/Constants";
import { IAttributeLocations, IUniformLocations, ShaderUtils } from "./ShaderUtils";

export class Shader {
  name: string;
  vertSrc: string;
  fragSrc: string;
  program: WebGLProgram | null;
  attribLoc: IAttributeLocations;
  uniformLoc: IUniformLocations;

  cullFace: Side;
  cullingEnabled: bool;
  doBlending: bool;

  constructor(name: string, vertSrc: string, fragSrc: string) {
    this.name = name;
    this.vertSrc = vertSrc;
    this.fragSrc = fragSrc;
    this.program = null;
    this.cullFace = Side.BackSide;
    this.cullingEnabled = true;
    this.doBlending = true;
    this.attribLoc = {
      norm: -1,
      uv: -1,
      position: -1,
    };
    this.uniformLoc = [];
  }

  compile(gl: WebGL2RenderingContext) {
    const vShader = ShaderUtils.createShader(gl, this.vertSrc, gl.VERTEX_SHADER);
    const fShader = ShaderUtils.createShader(gl, this.fragSrc, gl.FRAGMENT_SHADER);
    this.program = ShaderUtils.createProgram(gl, vShader, fShader);

    gl.useProgram(this.program);
    this.uniformLoc = ShaderUtils.getStandardUniformLocations(gl, this.program);

    this.attribLoc = ShaderUtils.getStandardAttribLocations(gl, this.program);
  }

  // fetchAttributeLocations(gl: WebGL2RenderingContext, program: WebGLProgram) {
  //   const n: number = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

  //   for (let i = 0; i < n; i++) {
  //     const info = gl.getActiveAttrib(program, i)!;
  //     const name = info.name;

  //     let locationSize = 1;
  //     if (info.type === gl.FLOAT_MAT2) locationSize = 2;
  //     if (info.type === gl.FLOAT_MAT3) locationSize = 3;
  //     if (info.type === gl.FLOAT_MAT4) locationSize = 4;

  //     // console.log( 'THREE.WebGLProgram: ACTIVE VERTEX ATTRIBUTE:', name, i );

  //     attributes[name] = {
  //       type: info.type,
  //       location: gl.getAttribLocation(program, name),
  //       locationSize: locationSize,
  //     };
  //   }
  // }

  getUniformIndex(name: string) {
    const toReturn = this.uniformLoc.findIndex((uniform) => uniform.name === name);
    return toReturn;
  }

  activate(gl: WebGL2RenderingContext) {
    gl.useProgram(this.program);
    return this;
  }

  deactivate(gl: WebGL2RenderingContext) {
    gl.useProgram(null);
    return this;
  }

  preRender() {}

  /**
   * Clean up resources when shader is no longer needed.
   */
  dispose(gl: WebGL2RenderingContext) {
    // Unbind the program if its currently active
    if (gl.getParameter(gl.CURRENT_PROGRAM) === this.program) gl.useProgram(null);

    gl.deleteProgram(this.program);
  }
}
