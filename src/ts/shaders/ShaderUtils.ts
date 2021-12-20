import {
  ATTR_NORMAL_LOC,
  ATTR_NORMAL_NAME,
  ATTR_POSITION_LOC,
  ATTR_POSITION_NAME,
  ATTR_UV_LOC,
  ATTR_UV_NAME,
} from "../../common/ShaderConstants";

export interface IAttributeLocations {
  position: number;
  norm: number;
  uv: number;
}

export type IUniformLocations = {
  name: string;
  location: WebGLUniformLocation;
}[];

export class ShaderUtils {
  /**
   * Create a shader by passing in its code and what type
   */
  static createShader(gl: WebGL2RenderingContext, src: string, type: number) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    // Get Error data if shader failed compiling
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Error compiling shader : " + src, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw new Error("Failed to compile shader");
    }

    return shader;
  }

  /**
   * Link two compiled shaders to create a program for rendering
   */
  static createProgram(gl: WebGL2RenderingContext, vShader: WebGLShader, fShader: WebGLShader) {
    var prog = gl.createProgram()!;
    gl.attachShader(prog, vShader);
    gl.attachShader(prog, fShader);

    // Force predefined locations for specific attributes. If the attibute isn't used in the shader its location will default to -1
    // Must be done *before* linking
    gl.bindAttribLocation(prog, ATTR_POSITION_LOC, ATTR_POSITION_NAME);
    gl.bindAttribLocation(prog, ATTR_NORMAL_LOC, ATTR_NORMAL_NAME);
    gl.bindAttribLocation(prog, ATTR_UV_LOC, ATTR_UV_NAME);

    gl.linkProgram(prog);

    // Check if successful
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Error creating shader program.", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      throw new Error("Failed to link program");
    }

    gl.validateProgram(prog);
    if (!gl.getProgramParameter(prog, gl.VALIDATE_STATUS)) {
      console.error("Error validating program", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      throw new Error("Failed to validate program");
    }

    // Can delete the shaders since the program has been made.
    gl.detachShader(prog, vShader); //TODO, detaching might cause issues on some browsers, Might only need to delete.
    gl.detachShader(prog, fShader);
    gl.deleteShader(fShader);
    gl.deleteShader(vShader);

    return prog;
  }

  //-------------------------------------------------
  // Setters / Getters
  //-------------------------------------------------

  // Get the locations of standard Attributes that we will mostly be using. Location will = -1 if attribute is not found.
  static getStandardAttribLocations(gl: WebGL2RenderingContext, program: WebGLProgram): IAttributeLocations {
    return {
      position: gl.getAttribLocation(program, ATTR_POSITION_NAME),
      norm: gl.getAttribLocation(program, ATTR_NORMAL_NAME),
      uv: gl.getAttribLocation(program, ATTR_UV_NAME),
    };
  }

  static getStandardUniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): IUniformLocations {
    return [
      {
        name: "projectionMatrix",
        location: gl.getUniformLocation(program, "projectionMatrix")!,
      },
      {
        name: "modelViewMatrix",
        location: gl.getUniformLocation(program, "modelViewMatrix")!,
      },
      {
        name: "mainTexture",
        location: gl.getUniformLocation(program, "uMainTex")!,
      },
    ];
  }
}
