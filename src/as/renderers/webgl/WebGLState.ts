import {
  Blending,
  BlendingEquation,
  CullFace,
  Side,
  GLFeatures,
  BlendingSrcFactor,
  BlendingDstFactor,
  GLBlendingEquations,
  DepthModes,
  BlendModes,
  Culling,
  FaceDirection,
  StencilFunc,
  StencilOp,
} from "../../../common/GLEnums";
import { WebGLRenderQueue } from "./WebGLRenderQueue";
import { Material } from "../../materials/Material";
import { Vector2 } from "../../math/Vector2";
import { Vector4 } from "../../math/Vector4";
import { BridgeManager } from "../../core/BridgeManager";

class ColorBuffer {
  private queue: WebGLRenderQueue;
  private locked: boolean;

  private color: Vector4 = new Vector4();
  private currentColorMask: boolean;
  currentColorClear: Vector4 = new Vector4(0, 0, 0, 0);

  constructor(queue: WebGLRenderQueue) {
    this.queue = queue;
    this.currentColorMask = false;
    this.locked = false;
  }

  setMask(colorMask: boolean): void {
    if (this.currentColorMask !== colorMask && !this.locked) {
      this.queue.glColorMask(colorMask, colorMask, colorMask, colorMask);
      this.currentColorMask = colorMask;
    }
  }

  setLocked(lock: boolean): void {
    this.locked = lock;
  }

  setClear(r: f32, g: f32, b: f32, a: f32, premultipliedAlpha: boolean = false): void {
    if (premultipliedAlpha === true) {
      r *= a;
      g *= a;
      b *= a;
    }

    this.color.set(r, g, b, a);

    if (this.currentColorClear.equals(this.color) === false) {
      this.currentColorClear.copy(this.color);
      this.queue.glClearColor(this.currentColorClear);
    }
  }

  reset(): void {
    this.locked = false;
    this.currentColorMask = false;
    this.currentColorClear.set(-1, 0, 0, 0); // set to invalid state
  }
}

class DepthBuffer {
  private queue: WebGLRenderQueue;
  private locked: boolean;
  private currentDepthMask: boolean;
  private currentDepthFunc: DepthModes;
  private currentDepthClear: f32;

  constructor(queue: WebGLRenderQueue) {
    this.queue = queue;
    this.locked = false;
    this.currentDepthMask = false;
    this.currentDepthFunc = -1;
    this.currentDepthClear = -1;
  }

  setTest(depthTest: boolean): void {
    if (depthTest) {
      this.queue.glEnable(GLFeatures.DEPTH_TEST);
    } else {
      this.queue.glDisable(GLFeatures.DEPTH_TEST);
    }
  }

  setMask(depthMask: boolean): void {
    if (this.currentDepthMask !== depthMask && !this.locked) {
      this.queue.glDepthMask(depthMask);
      this.currentDepthMask = depthMask;
    }
  }

  setFunc(depthFunc: DepthModes = DepthModes.LessEqualDepth): void {
    if (this.currentDepthFunc !== depthFunc) {
      this.queue.glDepthFunc(depthFunc);
      this.currentDepthFunc = depthFunc;
    }
  }

  setLocked(lock: boolean): void {
    this.locked = lock;
  }

  setClear(depth: f32): void {
    if (this.currentDepthClear !== depth) {
      this.queue.glClearDepth(depth);
      this.currentDepthClear = depth;
    }
  }

  reset(): void {
    this.locked = false;
    this.currentDepthMask = false;
    this.currentDepthFunc = -1;
    this.currentDepthClear = -1;
  }
}

class StencilBuffer {
  private queue: WebGLRenderQueue;
  private locked: boolean;
  private currentStencilMask: i32;
  private currentStencilFunc: i32;
  private currentStencilRef: i32;
  private currentStencilFuncMask: i32;
  private currentStencilFail: i32;
  private currentStencilZFail: i32;
  private currentStencilZPass: i32;
  private currentStencilClear: i32;

  constructor(queue: WebGLRenderQueue) {
    this.queue = queue;
    this.locked = false;
    this.currentStencilMask = -1;
    this.currentStencilFunc = -1;
    this.currentStencilRef = -1;
    this.currentStencilFuncMask = -1;
    this.currentStencilFail = -1;
    this.currentStencilZFail = -1;
    this.currentStencilZPass = -1;
    this.currentStencilClear = -1;
  }

  setTest(stencilTest: boolean): void {
    if (!this.locked) {
      if (stencilTest) {
        this.queue.glEnable(GLFeatures.STENCIL_TEST);
      } else {
        this.queue.glEnable(GLFeatures.STENCIL_TEST);
      }
    }
  }

  setMask(stencilMask: u32): void {
    if (this.currentStencilMask !== stencilMask && !this.locked) {
      this.queue.glStencilMask(stencilMask);
      this.currentStencilMask = stencilMask;
    }
  }

  setFunc(stencilFunc: StencilFunc, stencilRef: i32, stencilMask: i32): void {
    if (
      this.currentStencilFunc !== stencilFunc ||
      this.currentStencilRef !== stencilRef ||
      this.currentStencilFuncMask !== stencilMask
    ) {
      this.queue.glStencilFunc(stencilFunc, stencilRef, stencilMask);

      this.currentStencilFunc = stencilFunc;
      this.currentStencilRef = stencilRef;
      this.currentStencilFuncMask = stencilMask;
    }
  }

  setOp(stencilFail: StencilOp, stencilZFail: StencilOp, stencilZPass: StencilOp): void {
    if (
      this.currentStencilFail !== stencilFail ||
      this.currentStencilZFail !== stencilZFail ||
      this.currentStencilZPass !== stencilZPass
    ) {
      this.queue.glStencilOp(stencilFail, stencilZFail, stencilZPass);

      this.currentStencilFail = stencilFail;
      this.currentStencilZFail = stencilZFail;
      this.currentStencilZPass = stencilZPass;
    }
  }

  setLocked(lock: boolean): void {
    this.locked = lock;
  }

  setClear(stencil: i32): void {
    if (this.currentStencilClear !== stencil) {
      this.queue.glClearStencil(stencil);
      this.currentStencilClear = stencil;
    }
  }

  reset(): void {
    this.locked = false;

    this.currentStencilMask = -1;
    this.currentStencilFunc = -1;
    this.currentStencilRef = -1;
    this.currentStencilFuncMask = -1;
    this.currentStencilFail = -1;
    this.currentStencilZFail = -1;
    this.currentStencilZPass = -1;
    this.currentStencilClear = -1;
  }
}

export class WebGLState {
  private queue: WebGLRenderQueue;
  private colorBuffer: ColorBuffer;
  private depthBuffer: DepthBuffer;
  private stencilBuffer: StencilBuffer;

  private enabledCapabilities: Map<i32, boolean>;

  //   private xrFramebuffer = null;
  //   private currentBoundFramebuffers = {};

  //   private currentProgram = null;

  private currentBlendingEnabled: boolean;
  private currentBlending: Blending;
  private currentBlendEquation: BlendingEquation;
  private currentBlendSrc: BlendingSrcFactor;
  private currentBlendDst: BlendingDstFactor;
  private currentBlendEquationAlpha: i32;
  private currentBlendSrcAlpha: i32;
  private currentBlendDstAlpha: i32;
  private currentPremultipledAlpha: boolean;

  private currentFlipSided: boolean;
  private currentCullFace: CullFace;

  //   private currentLineWidth: f32 | null = null;

  private currentPolygonOffsetFactor: f32;
  private currentPolygonOffsetUnits: f32;

  //   private maxTextures = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);

  private equationToGL: Map<BlendingEquation, GLBlendingEquations> = new Map();
  private factorToGL: Map<i32, BlendModes> = new Map();

  //   private emptyTextures = {};

  //   private currentScissor: Vector4;
  private currentViewport: Vector4;

  //   //   private lineWidthAvailable = false;
  //   //   private version = 0;
  //   //   private glVersion = gl.getParameter(gl.VERSION);

  constructor(queue: WebGLRenderQueue, viewport: Vector4) {
    this.queue = queue;
    this.enabledCapabilities = new Map();
    this.depthBuffer = new DepthBuffer(queue);
    this.colorBuffer = new ColorBuffer(queue);
    this.stencilBuffer = new StencilBuffer(queue);

    this.currentPolygonOffsetUnits = -1;
    this.currentPolygonOffsetUnits = -1;
    this.currentFlipSided = false;
    this.currentPremultipledAlpha = false;

    this.currentBlendEquationAlpha = -1;
    this.currentBlendSrcAlpha = -1;
    this.currentBlendDstAlpha = -1;

    this.currentBlendingEnabled = false;
    this.currentBlending = -1;
    this.currentBlendEquation = -1;
    this.currentBlendSrc = -1;
    this.currentBlendDst = -1;

    //     // if (glVersion.indexOf("WebGL") !== -1) {
    //     //   this.version = parseFloat(/^WebGL (\d)/.exec(glVersion)[1]);
    //     //   this.lineWidthAvailable = this.version >= 1.0;
    //     // } else if (glVersion.indexOf("OpenGL ES") !== -1) {
    //     //   this.version = parseFloat(/^OpenGL ES (\d)/.exec(glVersion)[1]);
    //     //   this.lineWidthAvailable = this.version >= 2.0;
    //     // }

    //     let currentTextureSlot = null;
    //     let currentBoundTextures = {};

    //     const scissorParam = gl.getParameter(gl.SCISSOR_BOX);
    //     const viewportParam = gl.getParameter(gl.VIEWPORT);

    //     this.currentScissor = new Vector4().fromArray(scissorParam);
    this.currentViewport = viewport;

    //     this.emptyTextures[gl.TEXTURE_2D] = this.createTexture(gl.TEXTURE_2D, gl.TEXTURE_2D, 1);
    //     this.emptyTextures[gl.TEXTURE_CUBE_MAP] = this.createTexture(
    //       gl.TEXTURE_CUBE_MAP,
    //       gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    //       6
    //     );

    //     // init

    this.colorBuffer.setClear(0, 0, 0, 1);
    this.depthBuffer.setClear(1);
    this.stencilBuffer.setClear(0);

    //     this.enable(gl.DEPTH_TEST);
    //     this.depthBuffer.setFunc(DepthModes.LessEqualDepth);

    //     this.setFlipSided(false);
    //     this.setCullFace(CullFace.CullFaceBack);
    //     this.enable(gl.CULL_FACE);

    //     this.setBlending(Blending.NoBlending);

    this.factorToGL.set(BlendingSrcFactor.ZeroFactor, BlendModes.ZERO);
    this.factorToGL.set(BlendingSrcFactor.OneFactor, BlendModes.ONE);
    this.factorToGL.set(BlendingSrcFactor.SrcColorFactor, BlendModes.SRC_COLOR);
    this.factorToGL.set(BlendingSrcFactor.SrcAlphaFactor, BlendModes.SRC_ALPHA);
    this.factorToGL.set(BlendingSrcFactor.SrcAlphaSaturateFactor, BlendModes.SRC_ALPHA_SATURATE);
    this.factorToGL.set(BlendingSrcFactor.DstColorFactor, BlendModes.DST_COLOR);
    this.factorToGL.set(BlendingSrcFactor.DstAlphaFactor, BlendModes.DST_ALPHA);
    this.factorToGL.set(BlendingSrcFactor.OneMinusSrcColorFactor, BlendModes.ONE_MINUS_SRC_COLOR);
    this.factorToGL.set(BlendingSrcFactor.OneMinusSrcAlphaFactor, BlendModes.ONE_MINUS_SRC_ALPHA);
    this.factorToGL.set(BlendingSrcFactor.OneMinusDstColorFactor, BlendModes.ONE_MINUS_DST_COLOR);
    this.factorToGL.set(BlendingSrcFactor.OneMinusDstAlphaFactor, BlendModes.ONE_MINUS_DST_ALPHA);

    this.equationToGL.set(BlendingEquation.AddEquation, GLBlendingEquations.FUNC_ADD);
    this.equationToGL.set(BlendingEquation.SubtractEquation, GLBlendingEquations.FUNC_SUBTRACT);
    this.equationToGL.set(BlendingEquation.ReverseSubtractEquation, GLBlendingEquations.FUNC_REVERSE_SUBTRACT);
    this.equationToGL.set(BlendingEquation.MinEquation, GLBlendingEquations.MIN);
    this.equationToGL.set(BlendingEquation.MaxEquation, GLBlendingEquations.MAX);

    //     // if (isWebGL2) {
    // this.equationToGL[BlendingEquation.MinEquation] = gl.MIN;
    // this.equationToGL[BlendingEquation.MaxEquation] = gl.MAX;
    //     // }
    //     // else {
    //     //   const extension = extensions.get("EXT_blend_minmax");

    //     //   if (extension !== null) {
    //     //     equationToGL[MinEquation] = extension.MIN_EXT;
    //     //     equationToGL[MaxEquation] = extension.MAX_EXT;
    //     //   }
    //     // }
  }

  //   createTexture(type, target, count) {
  //     const data = new Uint8Array(4); // 4 is required to match default unpack alignment of 4.
  //     const texture = gl.createTexture();

  //     gl.bindTexture(type, texture);
  //     gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  //     gl.texParameteri(type, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  //     for (let i = 0; i < count; i++) {
  //       gl.texImage2D(target + i, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  //     }

  //     return texture;
  //   }

  //   //

  enable(id: i32): void {
    if (!this.enabledCapabilities.has(id)) {
      this.queue.glEnable(id);
      this.enabledCapabilities.set(id, true);
    }
  }

  disable(id: i32): void {
    if (this.enabledCapabilities.has(id)) {
      this.queue.glDisable(id);
      this.enabledCapabilities.set(id, false);
    }
  }

  //   bindXRFramebuffer(framebuffer) {
  //     if (framebuffer !== this.xrFramebuffer) {
  //       gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  //       this.xrFramebuffer = framebuffer;
  //     }
  //   }

  //   bindFramebuffer(target, framebuffer) {
  //     if (framebuffer === null && this.xrFramebuffer !== null) framebuffer = this.xrFramebuffer; // use active XR framebuffer if available

  //     if (this.currentBoundFramebuffers[target] !== framebuffer) {
  //       gl.bindFramebuffer(target, framebuffer);

  //       this.currentBoundFramebuffers[target] = framebuffer;

  //       if (isWebGL2) {
  //         // gl.DRAW_FRAMEBUFFER is equivalent to gl.FRAMEBUFFER

  //         if (target === gl.DRAW_FRAMEBUFFER) {
  //           currentBoundFramebuffers[gl.FRAMEBUFFER] = framebuffer;
  //         }

  //         if (target === gl.FRAMEBUFFER) {
  //           currentBoundFramebuffers[gl.DRAW_FRAMEBUFFER] = framebuffer;
  //         }
  //       }

  //       return true;
  //     }

  //     return false;
  //   }

  //   useProgram(program) {
  //     if (this.currentProgram !== program) {
  //       gl.useProgram(program);

  //       this.currentProgram = program;

  //       return true;
  //     }

  //     return false;
  //   }

  setBlending(
    blending: Blending,
    blendEquation: BlendingEquation,
    blendSrc: BlendingSrcFactor,
    blendDst: BlendingDstFactor,
    blendEquationAlpha: i32 | null,
    blendSrcAlpha: i32 | null,
    blendDstAlpha: i32 | null,
    premultipliedAlpha: boolean
  ): void {
    if (blending === Blending.NoBlending) {
      if (this.currentBlendingEnabled === true) {
        this.disable(GLFeatures.BLEND);
        this.currentBlendingEnabled = false;
      }

      return;
    }

    if (this.currentBlendingEnabled === false) {
      this.enable(GLFeatures.BLEND);
      this.currentBlendingEnabled = true;
    }

    if (blending !== Blending.CustomBlending) {
      if (blending !== this.currentBlending || premultipliedAlpha !== this.currentPremultipledAlpha) {
        if (
          this.currentBlendEquation !== BlendingEquation.AddEquation ||
          this.currentBlendEquationAlpha !== BlendingEquation.AddEquation
        ) {
          this.queue.glBlendEquation(GLBlendingEquations.FUNC_ADD);

          this.currentBlendEquation = BlendingEquation.AddEquation;
          this.currentBlendEquationAlpha = BlendingEquation.AddEquation;
        }

        if (premultipliedAlpha) {
          switch (blending) {
            case Blending.NormalBlending:
              this.queue.glBlendFuncSeparate(
                BlendModes.ONE,
                BlendModes.ONE_MINUS_SRC_ALPHA,
                BlendModes.ONE,
                BlendModes.ONE_MINUS_SRC_ALPHA
              );
              break;

            case Blending.AdditiveBlending:
              this.queue.glBlendFunc(BlendModes.ONE, BlendModes.ONE);
              break;

            case Blending.SubtractiveBlending:
              this.queue.glBlendFuncSeparate(
                BlendModes.ZERO,
                BlendModes.ZERO,
                BlendModes.ONE_MINUS_SRC_COLOR,
                BlendModes.ONE_MINUS_SRC_ALPHA
              );
              break;

            case Blending.MultiplyBlending:
              this.queue.glBlendFuncSeparate(
                BlendModes.ZERO,
                BlendModes.SRC_COLOR,
                BlendModes.ZERO,
                BlendModes.SRC_ALPHA
              );
              break;
          }
        } else {
          switch (blending) {
            case Blending.NormalBlending:
              this.queue.glBlendFuncSeparate(
                BlendModes.SRC_ALPHA,
                BlendModes.ONE_MINUS_SRC_ALPHA,
                BlendModes.ONE,
                BlendModes.ONE_MINUS_SRC_ALPHA
              );
              break;

            case Blending.AdditiveBlending:
              this.queue.glBlendFunc(BlendModes.SRC_ALPHA, BlendModes.ONE);
              break;

            case Blending.SubtractiveBlending:
              this.queue.glBlendFunc(BlendModes.ZERO, BlendModes.ONE_MINUS_SRC_COLOR);
              break;

            case Blending.MultiplyBlending:
              this.queue.glBlendFunc(BlendModes.ZERO, BlendModes.SRC_COLOR);
              break;
          }
        }

        this.currentBlendSrc = -1;
        this.currentBlendDst = -1;
        this.currentBlendSrcAlpha = -1;
        this.currentBlendDstAlpha = -1;
        this.currentBlending = blending;
        this.currentPremultipledAlpha = premultipliedAlpha;
      }

      return;
    }

    // custom blending

    blendEquationAlpha = blendEquationAlpha || blendEquation;
    blendSrcAlpha = blendSrcAlpha || blendSrc;
    blendDstAlpha = blendDstAlpha || blendDst;

    if (blendEquation !== this.currentBlendEquation || blendEquationAlpha !== this.currentBlendEquationAlpha) {
      this.queue.glBlendEquationSeparate(
        this.equationToGL.get(blendEquation),
        this.equationToGL.get(blendEquationAlpha)
      );

      this.currentBlendEquation = blendEquation;
      this.currentBlendEquationAlpha = blendEquationAlpha;
    }

    if (
      blendSrc !== this.currentBlendSrc ||
      blendDst !== this.currentBlendDst ||
      blendSrcAlpha !== this.currentBlendSrcAlpha ||
      blendDstAlpha !== this.currentBlendDstAlpha
    ) {
      this.queue.glBlendFuncSeparate(
        this.factorToGL.get(blendSrc),
        this.factorToGL.get(blendDst),
        this.factorToGL.get(blendSrcAlpha),
        this.factorToGL.get(blendDstAlpha)
      );

      this.currentBlendSrc = blendSrc;
      this.currentBlendDst = blendDst;
      this.currentBlendSrcAlpha = blendSrcAlpha;
      this.currentBlendDstAlpha = blendDstAlpha;
    }

    this.currentBlending = blending;
    this.currentPremultipledAlpha = false;
  }

  setMaterial(material: Material, frontFaceCW: boolean): void {
    material.side === Side.DoubleSide ? this.disable(Culling.CULL_FACE) : this.enable(Culling.CULL_FACE);

    let flipSided = material.side === Side.BackSide;
    if (frontFaceCW) flipSided = !flipSided;

    this.setFlipSided(flipSided);

    material.blending === Blending.NormalBlending && material.transparent === false
      ? this.setBlending(Blending.NoBlending, 0, 0, 0, 0, 0, 0, false)
      : this.setBlending(
          material.blending,
          material.blendEquation,
          material.blendSrc,
          material.blendDst,
          material.blendEquationAlpha,
          material.blendSrcAlpha,
          material.blendDstAlpha,
          material.premultipliedAlpha
        );

    this.depthBuffer.setFunc(material.depthFunc);
    this.depthBuffer.setTest(material.depthTest);
    this.depthBuffer.setMask(material.depthWrite);
    this.colorBuffer.setMask(material.colorWrite);

    const stencilWrite = material.stencilWrite;
    this.stencilBuffer.setTest(stencilWrite);
    if (stencilWrite) {
      this.stencilBuffer.setMask(material.stencilWriteMask);
      this.stencilBuffer.setFunc(material.stencilFunc, material.stencilRef, material.stencilFuncMask);
      this.stencilBuffer.setOp(material.stencilFail, material.stencilZFail, material.stencilZPass);
    }

    this.setPolygonOffset(material.polygonOffset, material.polygonOffsetVector);

    material.alphaToCoverage === true
      ? this.enable(GLFeatures.SAMPLE_ALPHA_TO_COVERAGE)
      : this.disable(GLFeatures.SAMPLE_ALPHA_TO_COVERAGE);
  }

  //

  setFlipSided(flipSided: boolean): void {
    if (this.currentFlipSided !== flipSided) {
      if (flipSided) {
        this.queue.glFrontFace(FaceDirection.CW);
      } else {
        this.queue.glFrontFace(FaceDirection.CCW);
      }

      this.currentFlipSided = flipSided;
    }
  }

  setCullFace(cullFace: CullFace): void {
    if (cullFace !== CullFace.CullFaceNone) {
      this.enable(Culling.CULL_FACE);

      if (cullFace !== this.currentCullFace) {
        if (cullFace === CullFace.CullFaceBack) {
          this.queue.glCullFace(Culling.BACK);
        } else if (cullFace === CullFace.CullFaceFront) {
          this.queue.glCullFace(Culling.FRONT);
        } else {
          this.queue.glCullFace(Culling.FRONT_AND_BACK);
        }
      }
    } else {
      this.disable(Culling.CULL_FACE);
    }

    this.currentCullFace = cullFace;
  }

  //   setLineWidth(width: f32) {
  //     if (width !== this.currentLineWidth) {
  //       // if (this.lineWidthAvailable)
  //       gl.lineWidth(width);

  //       this.currentLineWidth = width;
  //     }
  //   }

  setPolygonOffset(polygonOffset: boolean, polygonalOffsetVec: Vector2): void {
    if (polygonOffset) {
      this.enable(GLFeatures.POLYGON_OFFSET_FILL);

      if (
        this.currentPolygonOffsetFactor !== polygonalOffsetVec.x ||
        this.currentPolygonOffsetUnits !== polygonalOffsetVec.y
      ) {
        this.queue.glPolygonOffset(polygonalOffsetVec);

        this.currentPolygonOffsetFactor = polygonalOffsetVec.x;
        this.currentPolygonOffsetUnits = polygonalOffsetVec.y;
      }
    } else {
      this.disable(GLFeatures.POLYGON_OFFSET_FILL);
    }
  }

  //   setScissorTest(scissorTest: boolean) {
  //     if (scissorTest) {
  //       this.enable(gl.SCISSOR_TEST);
  //     } else {
  //       this.disable(gl.SCISSOR_TEST);
  //     }
  //   }

  //   // texture

  //   activeTexture(webglSlot) {
  //     if (webglSlot === undefined) webglSlot = gl.TEXTURE0 + maxTextures - 1;

  //     if (this.currentTextureSlot !== webglSlot) {
  //       gl.activeTexture(webglSlot);
  //       this.currentTextureSlot = webglSlot;
  //     }
  //   }

  //   bindTexture(webglType, webglTexture) {
  //     if (currentTextureSlot === null) {
  //       this.activeTexture();
  //     }

  //     let boundTexture = this.currentBoundTextures[this.currentTextureSlot];

  //     if (boundTexture === undefined) {
  //       boundTexture = { type: undefined, texture: undefined };
  //       this.currentBoundTextures[this.currentTextureSlot] = boundTexture;
  //     }

  //     if (boundTexture.type !== webglType || boundTexture.texture !== webglTexture) {
  //       gl.bindTexture(webglType, webglTexture || this.emptyTextures[webglType]);

  //       boundTexture.type = webglType;
  //       boundTexture.texture = webglTexture;
  //     }
  //   }

  //   unbindTexture() {
  //     const boundTexture = this.currentBoundTextures[this.currentTextureSlot];

  //     if (boundTexture !== undefined && boundTexture.type !== undefined) {
  //       gl.bindTexture(boundTexture.type, null);

  //       boundTexture.type = undefined;
  //       boundTexture.texture = undefined;
  //     }
  //   }

  //   compressedTexImage2D() {
  //     try {
  //       gl.compressedTexImage2D.apply(gl, arguments);
  //     } catch (error) {
  //       console.error("THREE.WebGLState:", error);
  //     }
  //   }

  //   texImage2D() {
  //     try {
  //       gl.texImage2D.apply(gl, arguments);
  //     } catch (error) {
  //       console.error("THREE.WebGLState:", error);
  //     }
  //   }

  //   texImage3D() {
  //     try {
  //       gl.texImage3D.apply(gl, arguments);
  //     } catch (error) {
  //       console.error("THREE.WebGLState:", error);
  //     }
  //   }

  //   //

  //   scissor(scissor: Vector4) {
  //     if (this.currentScissor.equals(scissor) === false) {
  //       gl.scissor(scissor.x, scissor.y, scissor.z, scissor.w);
  //       this.currentScissor.copy(scissor);
  //     }
  //   }

  viewport(viewport: Vector4): void {
    if (this.currentViewport.equals(viewport) === false) {
      BridgeManager.getBridge().viewport(viewport.x, viewport.y, viewport.z, viewport.w);
      this.currentViewport.copy(viewport);
    }
  }

  //   //

  reset(): void {
    // reset state
    const queue = this.queue;

    queue.glDisable(GLFeatures.BLEND);
    queue.glDisable(Culling.CULL_FACE);
    queue.glDisable(GLFeatures.DEPTH_TEST);
    queue.glDisable(GLFeatures.POLYGON_OFFSET_FILL);
    queue.glDisable(GLFeatures.SCISSOR_TEST);
    queue.glDisable(GLFeatures.STENCIL_TEST);
    queue.glDisable(GLFeatures.SAMPLE_ALPHA_TO_COVERAGE);

    queue.glBlendEquation(GLBlendingEquations.FUNC_ADD);
    queue.glBlendFunc(BlendModes.ONE, BlendModes.ZERO);
    queue.glBlendFuncSeparate(BlendModes.ONE, BlendModes.ZERO, BlendModes.ONE, BlendModes.ZERO);

    // queue.glColorMask(true, true, true, true);
    // queue.glClearColor(0, 0, 0, 0);

    //     gl.depthMask(true);
    //     gl.depthFunc(gl.LESS);
    //     gl.clearDepth(1);

    //     gl.stencilMask(0xffffffff);
    //     gl.stencilFunc(gl.ALWAYS, 0, 0xffffffff);
    //     gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    //     gl.clearStencil(0);

    //     gl.cullFace(gl.BACK);
    //     gl.frontFace(gl.CCW);

    //     gl.polygonOffset(0, 0);

    //     gl.activeTexture(gl.TEXTURE0);

    //     gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //     if (isWebGL2 === true) {
    //       gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    //       gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    //     }

    //     gl.useProgram(null);

    //     gl.lineWidth(1);

    //     gl.scissor(0, 0, gl.canvas.width, gl.canvas.height);
    //     gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // reset internals

    this.enabledCapabilities = new Map();

    //     this.currentTextureSlot = null;
    //     this.currentBoundTextures = {};

    //     this.xrFramebuffer = null;
    //     this.currentBoundFramebuffers = {};

    //     this.currentProgram = null;

    this.currentBlendingEnabled = false;
    this.currentBlending = -1;
    this.currentBlendEquation = -1;
    this.currentBlendSrc = -1;
    this.currentBlendDst = -1;
    this.currentBlendEquationAlpha = -1;
    this.currentBlendSrcAlpha = -1;
    this.currentBlendDstAlpha = -1;
    this.currentPremultipledAlpha = false;

    this.currentFlipSided = false;
    this.currentCullFace = -1;

    //     this.currentLineWidth = null;

    this.currentPolygonOffsetFactor = -1;
    this.currentPolygonOffsetUnits = -1;

    // this.currentScissor.set(0, 0, gl.canvas.width, gl.canvas.height);
    // this.currentViewport.set(0, 0, gl.canvas.width, gl.canvas.height);

    this.colorBuffer.reset();
    this.depthBuffer.reset();
    this.stencilBuffer.reset();
  }
}

// // return {

// // 	buffers: {
// // 		color: colorBuffer,
// // 		depth: depthBuffer,
// // 		stencil: stencilBuffer
// // 	},

// // 	enable: enable,
// // 	disable: disable,

// // 	bindFramebuffer: bindFramebuffer,
// // 	bindXRFramebuffer: bindXRFramebuffer,

// // 	useProgram: useProgram,

// // 	setBlending: setBlending,
// // 	setMaterial: setMaterial,

// // 	setFlipSided: setFlipSided,
// // 	setCullFace: setCullFace,

// // 	setLineWidth: setLineWidth,
// // 	setPolygonOffset: setPolygonOffset,

// // 	setScissorTest: setScissorTest,

// // 	activeTexture: activeTexture,
// // 	bindTexture: bindTexture,
// // 	unbindTexture: unbindTexture,
// // 	compressedTexImage2D: compressedTexImage2D,
// // 	texImage2D: texImage2D,
// // 	texImage3D: texImage3D,

// // 	scissor: scissor,
// // 	viewport: viewport,

// // 	reset: reset

// // };
