// import { Shader } from "../shaders/Shader";
// import { TestShader } from "../shaders/webgl2/test-shader/TestShader";
// import { QuadShader } from "../shaders/webgl2/quad/QuadShader";
// import { DebugShader } from "../shaders/webgl2/debug/DebugShader";
// import { Commands } from "../../common/Commands";
// import { InputManager } from "./InputManager";
// import { Side } from "../../common/Constants";
// import { PrimitiveType } from "../../common/GLEnums";
// import { vaos } from "../AppBindings";
// import { Texture, TextureHtmlImage } from "./Texture";
// import { WasmController } from "./WasmController";

// const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;

// export class ContextManager {
//   canvas: HTMLCanvasElement;
//   gl: WebGL2RenderingContext;
//   shaders: Shader[] = [];
//   textures: Texture[] = [];
//   // exports: ExportType | null;
//   controller: WasmController;

//   // wasmArrayBuffer: Uint32Array | null;
//   // wasmF32Buffer: Float32Array | null;
//   // wasmDataView: DataView | null;
//   inputManager: InputManager | null;
//   onResizeHandler: () => void;
//   onFrameHandler: () => void;
//   disposed: boolean;

//   constructor(canvasId: string, controller: WasmController) {
//     this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
//     this.gl = this.canvas.getContext("webgl2")!;
//     this.controller = controller;
//     // this.exports = null;
//     this.disposed = false;
//     // this.wasmArrayBuffer = null;
//     // this.wasmF32Buffer = null;
//     // this.wasmDataView = null;
//     this.inputManager = null;
//     const gl = this.gl;
//     this.onResizeHandler = this.onWindowResize.bind(this);
//     this.onFrameHandler = this.onFrame.bind(this);

//     if (!gl) throw new Error("WebGL context is not available.");

//     // Initialize size
//     this.onWindowResize();

//     //...................................................
//     // Setup GL, Set all the default configurations we need.
//     gl.enable(gl.DEPTH_TEST);
//     gl.cullFace(Side.BackSide);
//     gl.enable(gl.CULL_FACE);
//     gl.frontFace(gl.CCW);
//     gl.depthFunc(gl.LEQUAL);
//     gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
//     gl.clearColor(1.0, 1.0, 1.0, 1.0);

//     this.shaders.push(new TestShader([0.8, 0.8, 0.8, 1, 0, 0, 0, 1, 0, 0, 0, 1]), new QuadShader(), new DebugShader());
//   }

//   // _TEMP_ADD_MESH() {
//   //   const arrayPtr = this.exports!.exports.__newArray(exports.Float32ArrayID, [4.5, 3.6, 6.4]);
//   //   const objectId = exports.addMesh(arrayPtr);
//   //   console.log(`We seem to have object ${objectId}`);
//   // }

//   getTexureIndex(path: string) {
//     const toReturn = this.textures.findIndex((texture) => texture.path === path);
//     if (toReturn === -1) throw new Error(`Texture '${path}' does not exist`);
//     return toReturn;
//   }

//   getUniformLocation(shaderIndex: number, name: string) {
//     const shader = this.shaders[shaderIndex];
//     if (!shader) throw new Error(`Shader [${shaderIndex}] does not exist`);
//     return shader.getUniformIndex(name);
//   }

//   onWindowResize() {
//     const w = window.innerWidth;
//     const h = window.innerHeight;
//     this.setViewportSize(w, h);
//   }

//   onFrame() {
//     if (this.disposed) return;
//     this.controller.update(performance.now());
//     window.requestAnimationFrame(this.onFrameHandler);
//   }

//   async initialize() {
//     const gl = this.gl;
//     // this.exports = exports;

//     this.inputManager = new InputManager(this.canvas, this.controller);

//     for (let i = 0; i < this.shaders.length; i++) {
//       const shader = this.shaders[i];
//       shader.compile(gl);
//       this.controller.createShader(shader, i);
//     }

//     const texturePaths = ["./media/uv-grid.jpg"];
//     const textures = this.textures;
//     const promises: Promise<void>[] = [];
//     for (const texturePath of texturePaths) {
//       const newTexture = new TextureHtmlImage(texturePath);
//       promises.push(newTexture.load());
//       textures.push(newTexture);
//     }

//     await Promise.all(promises);
//     for (const texture of textures) {
//       texture.init(gl);
//     }

//     this.controller.init(this.canvas.width, this.canvas.height);

//     // Setup events
//     window.addEventListener("resize", this.onResizeHandler);
//     window.requestAnimationFrame(this.onFrameHandler);
//   }

//   dispose() {
//     this.disposed = true;
//     window.removeEventListener("resize", this.onResizeHandler);
//     this.inputManager?.dispose();
//   }

//   renderQueue(commandBuffer: Array<number>, arrayBuffer: Uint32Array, f32Buffer: Float32Array, wasmDataView: DataView) {
//     const gl = this.gl;

//     let vecPtrIndex = 0;

//     const getPtrIndex = function (ptr: number) {
//       return arrayBuffer[(ptr + ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
//     };

//     let activeShader: Shader | null = null;

//     for (let i = 0, l = commandBuffer.length; i < l; i++) {
//       const command = commandBuffer[i];

//       switch (command) {
//         case Commands.CLEAR:
//           this.clear();
//           break;
//         case Commands.GL_ENABLE:
//           i++;
//           gl.enable(commandBuffer[i]);
//           break;
//         case Commands.GL_DISABLE:
//           i++;
//           gl.disable(commandBuffer[i]);
//           break;
//         case Commands.GL_DEPTH_MASK:
//           i++;
//           gl.depthMask(commandBuffer[i] !== 0);
//           break;
//         case Commands.GL_DEPTH_FUNC:
//           i++;
//           gl.depthFunc(commandBuffer[i]);
//           break;

//         // TODO: This must be converted to f32
//         case Commands.GL_CLEAR_DEPTH:
//           i++;
//           const depth = wasmDataView.getFloat32(commandBuffer[i], true);
//           gl.clearDepth(depth);
//           break;

//         case Commands.GL_BLEND_EQUATION:
//           i++;
//           gl.blendEquation(commandBuffer[i]);
//           break;
//         case Commands.GL_CULLFACE:
//           i++;
//           gl.cullFace(commandBuffer[i]);
//           break;
//         case Commands.GL_FRONT_FACE:
//           i++;
//           gl.frontFace(commandBuffer[i]);
//           break;
//         case Commands.GL_CLEAR_STENCIL:
//           i++;
//           gl.clearStencil(commandBuffer[i]);
//           break;
//         case Commands.GL_POLYGON_OFFSET:
//           i++;
//           vecPtrIndex = commandBuffer[i];
//           gl.polygonOffset(wasmDataView.getFloat32(vecPtrIndex, true), wasmDataView.getFloat32(vecPtrIndex + 4, true));
//           break;
//         case Commands.GL_STENCIL_MASK:
//           i++;
//           gl.stencilMask(commandBuffer[i]);
//           break;
//         case Commands.GL_BLEND_FUNC:
//           gl.blendFunc(commandBuffer[i + 1], commandBuffer[i + 2]);
//           i += 2;
//           break;
//         case Commands.GL_STENCIL_FUNC:
//           gl.stencilFunc(commandBuffer[i + 1], commandBuffer[i + 2], commandBuffer[i + 3]);
//           i += 3;
//           break;
//         case Commands.GL_COLOR_MASK:
//           gl.colorMask(
//             commandBuffer[i + 1] !== 0,
//             commandBuffer[i + 2] !== 0,
//             commandBuffer[i + 3] !== 0,
//             commandBuffer[i + 4] !== 0
//           );
//           i += 4;
//           break;

//         case Commands.GL_CLEAR_COLOR:
//           i++;
//           vecPtrIndex = commandBuffer[i];
//           gl.clearColor(
//             wasmDataView.getFloat32(vecPtrIndex, true),
//             wasmDataView.getFloat32(vecPtrIndex + 4, true),
//             wasmDataView.getFloat32(vecPtrIndex + 8, true),
//             wasmDataView.getFloat32(vecPtrIndex + 12, true)
//           );
//           break;

//         case Commands.GL_STENCIL_OP:
//           gl.stencilOp(commandBuffer[i + 1], commandBuffer[i + 2], commandBuffer[i + 3]);
//           i += 3;
//           break;
//         case Commands.GL_BLEND_EQUATION_SEPARATE:
//           gl.blendEquationSeparate(commandBuffer[i + 1], commandBuffer[i + 2]);
//           i += 2;
//           break;
//         case Commands.GL_BLEND_FUNC_SEPARATE:
//           gl.blendFuncSeparate(commandBuffer[i + 1], commandBuffer[i + 2], commandBuffer[i + 3], commandBuffer[i + 4]);
//           i += 4;
//           break;
//         case Commands.ACTIVATE_SHADER:
//           i++;
//           activeShader = this.activateShader(commandBuffer[i]);
//           break;
//         case Commands.RENDER_VAO:
//           this.renderVao(commandBuffer[i + 1], commandBuffer[i + 2], commandBuffer[i + 3], commandBuffer[i + 4]);
//           i += 4;
//           break;
//         case Commands.UTEXTURE2D:
//           this.setTexture2D(activeShader!, commandBuffer[i + 1], commandBuffer[i + 2]);
//           i += 2;
//           break;
//         case Commands.UMATRIX4FV:
//           gl.uniformMatrix4fv(
//             activeShader!.uniformLoc[commandBuffer[i + 1]].location,
//             false,
//             f32Buffer,
//             getPtrIndex(commandBuffer[i + 2]) >>> 2,
//             16
//           );
//           i += 2;
//           break;
//       }
//     }
//   }

//   clear() {
//     this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
//   }

//   activateShader(index: number) {
//     const gl = this.gl;
//     const shader = this.shaders[index];
//     shader.activate(gl);
//     shader.preRender();

//     if (shader.cullingEnabled) {
//       gl.enable(gl.CULL_FACE);
//       gl.cullFace(shader.cullFace);
//     } else {
//       gl.disable(gl.CULL_FACE);
//     }

//     if (shader.doBlending) this.gl.enable(this.gl.BLEND);
//     else this.gl.disable(this.gl.BLEND);

//     return shader;
//   }

//   setTexture2D(activeShader: Shader, uniformIndex: number, textureIndex: number) {
//     const gl = this.gl;
//     const uniformLocation = activeShader.uniformLoc[uniformIndex].location;
//     gl.activeTexture(gl.TEXTURE0);
//     gl.bindTexture(gl.TEXTURE_2D, this.textures[textureIndex].webglTexture);
//     gl.uniform1i(uniformLocation, 0);
//   }

//   renderVao(index: number, indexCount: number, vertexCount: number, drawMode: PrimitiveType) {
//     const gl = this.gl;
//     const vao = vaos[index];

//     // Enable VAO, this will set all the predefined attributes for the shader
//     gl.bindVertexArray(vao);

//     if (indexCount !== -1) gl.drawElements(drawMode, indexCount, gl.UNSIGNED_SHORT, 0);
//     else gl.drawArrays(drawMode, 0, vertexCount);

//     gl.bindVertexArray(null);
//   }

//   setViewportSize(w: number, h: number) {
//     this.canvas.style.width = w + "px";
//     this.canvas.style.height = h + "px";
//     this.canvas.width = w;
//     this.canvas.height = h;
//     this.gl.viewport(0, 0, w, h);
//     this.controller.resize(w, h);
//     return this;
//   }
// }
