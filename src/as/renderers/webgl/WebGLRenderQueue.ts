import { Commands } from "../../../common/Commands";
import { Vao } from "../../objects/Vao";
import { BridgeManager } from "../../core/BridgeManager";
import { ShaderRef } from "./ShaderRef";
import {
  BlendModes,
  Culling,
  DepthModes,
  FaceDirection,
  GLBlendingEquations,
  StencilFunc,
  StencilOp,
} from "../../../common/GLEnums";
import { Vector4 } from "../../math/Vector4";
import { Vector2 } from "../../math/Vector2";

export class WebGLRenderQueue {
  q: Array<i32>;
  clearDepth: Float32Array;

  constructor() {
    this.q = new Array<i32>();
    this.clearDepth = new Float32Array(1);
  }

  begin(): WebGLRenderQueue {
    this.q.splice(0, this.q.length);
    return this;
  }

  clear(): WebGLRenderQueue {
    this.q.push(Commands.CLEAR);
    return this;
  }

  glFrontFace(face: FaceDirection): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_FRONT_FACE);
    q.push(face);
    return this;
  }

  glBlendEquationSeparate(modeRGB: GLBlendingEquations, modeAlpha: GLBlendingEquations): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_BLEND_EQUATION_SEPARATE);
    q.push(modeRGB);
    q.push(modeAlpha);
    return this;
  }

  glBlendFunc(sfactor: BlendModes, dfactor: BlendModes): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_BLEND_FUNC);
    q.push(sfactor);
    q.push(dfactor);
    return this;
  }

  glBlendEquation(mode: GLBlendingEquations): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_BLEND_EQUATION);
    q.push(mode);
    return this;
  }

  glBlendFuncSeparate(
    srcRGB: BlendModes,
    dstRGB: BlendModes,
    srcAlpha: BlendModes,
    dstAlpha: BlendModes
  ): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_BLEND_FUNC_SEPARATE);
    q.push(srcRGB);
    q.push(dstRGB);
    q.push(srcAlpha);
    q.push(dstAlpha);
    return this;
  }

  glColorMask(r: boolean, g: boolean, b: boolean, a: boolean): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_COLOR_MASK);
    q.push(r ? 1 : 0);
    q.push(g ? 1 : 0);
    q.push(b ? 1 : 0);
    q.push(a ? 1 : 0);
    return this;
  }

  glClearColor(color: Vector4): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_CLEAR_COLOR);
    q.push(changetype<i32>(color));
    return this;
  }

  glCullFace(culling: Culling): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_CULLFACE);
    q.push(culling);
    return this;
  }

  glPolygonOffset(offset: Vector2): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_POLYGON_OFFSET);
    q.push(changetype<i32>(offset));
    return this;
  }

  glEnable(feature: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_ENABLE);
    q.push(feature);
    return this;
  }

  glStencilMask(mask: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_STENCIL_MASK);
    q.push(mask);
    return this;
  }

  glStencilFunc(stencilFunc: StencilFunc, stencilRef: i32, stencilMask: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_STENCIL_FUNC);
    q.push(stencilFunc);
    q.push(stencilRef);
    q.push(stencilMask);
    return this;
  }

  glStencilOp(stencilFail: StencilOp, stencilZFail: StencilOp, stencilZPass: StencilOp): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_STENCIL_OP);
    q.push(stencilFail);
    q.push(stencilZFail);
    q.push(stencilZPass);
    return this;
  }

  glClearStencil(value: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_CLEAR_STENCIL);
    q.push(value);
    return this;
  }

  glDepthMask(useMask: boolean): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_DEPTH_MASK);
    q.push(useMask ? 1 : 0);
    return this;
  }

  glDepthFunc(mode: DepthModes): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_DEPTH_FUNC);
    q.push(mode);
    return this;
  }

  glClearDepth(depth: f32): WebGLRenderQueue {
    const q = this.q;
    this.clearDepth[0] = depth;
    q.push(Commands.GL_CLEAR_DEPTH);
    q.push(changetype<i32>(this.clearDepth));
    return this;
  }

  glDisable(feature: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.GL_DISABLE);
    q.push(feature);
    return this;
  }

  activateShader(shaderRef: ShaderRef): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.ACTIVATE_SHADER);
    q.push(shaderRef.shaderIndex);
    return this;
  }

  unifTexture2D(uniformLocation: u32, texture: i32): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.UTEXTURE2D);
    q.push(uniformLocation);
    q.push(texture);
    return this;
  }

  unifMat4(uniformLocation: u32, matrix: Float32Array): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.UMATRIX4FV);
    q.push(uniformLocation);
    q.push(changetype<i32>(matrix));
    return this;
  }

  renderVao(mesh: Vao): WebGLRenderQueue {
    const q = this.q;
    q.push(Commands.RENDER_VAO);
    q.push(mesh.vao);
    q.push(mesh.indexCount);
    q.push(mesh.vertexCount);
    q.push(mesh.drawMode);
    return this;
  }

  push(): WebGLRenderQueue {
    BridgeManager.getBridge().renderQueue(this.q);
    return this;
  }
}
