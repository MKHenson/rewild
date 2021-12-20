// import { PipelineResourceType } from "src/common/PipelineResourceType";
import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { ExportType } from "./index-webgpu";
import { GameManager } from "./webgpu/gameManager";

type Import = WebAssembly.Imports;
export const vaos: WebGLVertexArrayObject[] = [];
export const buffers: WebGLBuffer[] = [];
let wasmExports: ExportType;
let wasmArrayBuffer: Uint32Array, wasmDataView: DataView, wasmMemoryBlock: ArrayBuffer;

export function bindExports(exports: ExportType) {
  wasmExports = exports;

  wasmMemoryBlock = wasmExports.exports.memory!.buffer;
  wasmArrayBuffer = new Uint32Array(wasmMemoryBlock);
  wasmDataView = new DataView(exports.exports.memory.buffer);
  wasmDataView;
}

export function createBindingsGPU(importObject: Import, gameManager: GameManager) {
  if (!importObject.env.memory) throw new Error("You need to set memory in your importObject");

  const binding = {
    print(stringIndex: number) {
      if (wasmExports) console.log(wasmExports.exports.__getString(stringIndex));
    },
    // createUniformBuffer(pipeline: number, type: PipelineResourceType, size: number, labelPtr?: number) {
    //   const label = labelPtr ? wasmExports.exports.__getString(labelPtr) : undefined;
    //   return gameManager.pipelines[pipeline].createBufferResource(type, size, gameManager.device, label);
    // },
    createBufferFromF32(data: number, usage: GPUBufferUsageFlags) {
      const buffer = wasmExports.exports.__getFloat32Array(data);
      return gameManager.createBufferF32(buffer, usage);
    },
    createIndexBuffer(data: number, usage: GPUBufferUsageFlags) {
      const buffer = wasmExports.exports.__getUint32Array(data);
      return gameManager.createIndexBuffer(buffer, usage);
    },
    render(commandsIndex: number) {
      const commandBuffer = wasmExports.exports.__getArray(commandsIndex) as Array<number>;
      gameManager.renderQueueManager.run(commandBuffer, wasmArrayBuffer, wasmMemoryBlock);
      // gameManager.render();
    },
  };

  importObject.Imports = binding;
}

// export function createBindings(importObject: Import, renderer: ContextManager) {
//   if (!importObject.env.memory) throw new Error("You need to set memory in your importObject");

//   const gl = renderer.gl;
//   const binding = {
//     clear() {
//       renderer.clear();
//     },
//     renderQueue(commandsIndex: number) {
//       const commandBuffer = wasmExports.exports.__getArray(commandsIndex) as Array<number>;
//       renderer.renderQueue(commandBuffer, wasmArrayBuffer, wasmF32Buffer, wasmDataView);
//     },
//     getTexureIndex(path: number) {
//       return renderer.getTexureIndex(binding.getString(path));
//     },
//     getUniformLocation(shaderIndex: number, name: number) {
//       return renderer.getUniformLocation(shaderIndex, binding.getString(name));
//     },
//     getString(stringIndex: number) {
//       const buffer = (importObject.env as any).memory.buffer;
//       const U32 = new Uint32Array(buffer);
//       const id_addr = stringIndex / 4 - 2;
//       const id = U32[id_addr];
//       if (id !== 0x01) throw Error(`not a string index=${stringIndex} id=${id}`);
//       const len = U32[id_addr + 1];
//       const str = new TextDecoder("utf-16").decode(buffer.slice(stringIndex, stringIndex + len));
//       return str;
//     },
//     print(stringIndex: number) {
//       console.log(binding.getString(stringIndex));
//     },
//     createVertexArray() {
//       vaos.push(gl.createVertexArray()!);
//       return vaos.length - 1;
//     },
//     deleteVertexArray(index: number) {
//       gl.deleteVertexArray(index === -1 ? null : vaos[index]);
//     },
//     bindVertexArray(index: number) {
//       gl.bindVertexArray(index === -1 ? null : vaos[index]);
//     },
//     enableVertexAttribArray(index: number) {
//       gl.enableVertexAttribArray(index);
//     },
//     vertexAttribDivisor(index: number, divisor: number) {
//       gl.vertexAttribDivisor(index, divisor);
//     },
//     getParameterI32(param: ShaderConstants) {
//       return gl.getParameter(param);
//     },
//     createBuffer() {
//       buffers.push(gl.createBuffer()!);
//       return buffers.length - 1;
//     },
//     bindBuffer(type: BufferObjects, index: number) {
//       gl.bindBuffer(type, index === -1 ? null : buffers[index]);
//     },
//     deleteBuffer(index: number) {
//       gl.deleteBuffer(buffers[index]);
//     },
//     bufferSubData(target: BufferObjects, offset: number, data: number, srcOffset: number, length: number) {
//       const buffer = wasmExports.exports.__getArrayView(data);
//       if (length) gl.bufferSubData(target, offset, buffer, srcOffset, length);
//       else gl.bufferSubData(target, offset, buffer);
//     },
//     bufferData(target: BufferObjects, data: number, usage: UsageType) {
//       const buffer = wasmExports.exports.__getArrayView(data);
//       gl.bufferData(target, buffer, usage);
//     },
//     vertexAttribPointer(
//       index: number,
//       size: number,
//       type: DataType,
//       normalized: boolean,
//       stride: number,
//       offset: number
//     ) {
//       gl.vertexAttribPointer(index, size, type, normalized, stride, offset);
//     },
//     vertexAttribIPointer(index: number, size: number, type: DataType, stride: number, offset: number) {
//       gl.vertexAttribIPointer(index, size, type, stride, offset);
//     },
//     disableVertexAttribArray(index: number) {
//       gl.disableVertexAttribArray(index);
//     },
//     vertexAttrib2fv(index: number, values: number) {
//       const buffer = wasmExports.exports.__getFloat32Array(values);
//       gl.vertexAttrib2fv(index, buffer);
//     },
//     vertexAttrib3fv(index: number, values: number) {
//       const buffer = wasmExports.exports.__getFloat32Array(values);
//       gl.vertexAttrib3fv(index, buffer);
//     },
//     vertexAttrib4fv(index: number, values: number) {
//       const buffer = wasmExports.exports.__getFloat32Array(values);
//       gl.vertexAttrib4fv(index, buffer);
//     },
//     vertexAttrib1fv(index: number, values: number) {
//       const buffer = wasmExports.exports.__getFloat32Array(values);
//       gl.vertexAttrib1fv(index, buffer);
//     },
//     viewport(x: number, y: number, width: number, height: number) {
//       gl.viewport(x, y, width, height);
//     },
//   };

//   importObject.Imports = binding;
// }
