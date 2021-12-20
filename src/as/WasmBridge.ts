// import { IBridge } from "../common/IBridge";
// import { BufferObjects, DataType, ShaderConstants, UsageType } from "../common/GLEnums";
// import {
//   bindBuffer,
//   bindVertexArray,
//   bufferData,
//   bufferSubData,
//   createBufferFromF32,
//   createVertexArray,
//   deleteBuffer,
//   deleteVertexArray,
//   disableVertexAttribArray,
//   enableVertexAttribArray,
//   getParameterI32,
//   getTexureIndex,
//   getUniformLocation,
//   print,
//   renderQueue,
//   vertexAttrib1fv,
//   vertexAttrib2fv,
//   vertexAttrib3fv,
//   vertexAttrib4fv,
//   vertexAttribDivisor,
//   vertexAttribIPointer,
//   vertexAttribPointer,
//   viewport,
// } from "./Imports";

// export class WasmBridge implements IBridge {
//   createVertexArray(): i32 {
//     return createVertexArray();
//   }
//   bindVertexArray(index: i32): void {
//     bindVertexArray(index);
//   }
//   deleteVertexArray(index: i32): void {
//     deleteVertexArray(index);
//   }
//   getParameterI32(param: ShaderConstants): i32 {
//     return getParameterI32(param);
//   }
//   enableVertexAttribArray(index: i32): void {
//     enableVertexAttribArray(index);
//   }
//   vertexAttribDivisor(index: i32, divisor: i32): void {
//     vertexAttribDivisor(index, divisor);
//   }
//   createBuffer(): i32 {
//     return createBufferFromF32();
//   }
//   deleteBuffer(index: i32): void {
//     deleteBuffer(index);
//   }
//   bufferSubData(type: BufferObjects, offset: i32, data: ArrayBufferView, srcOffset: i32, length: i32): void {
//     bufferSubData(type, offset, changetype<i32>(data), srcOffset, length);
//   }
//   bindBuffer(type: BufferObjects, index: i32): void {
//     bindBuffer(type, index);
//   }
//   bufferData(target: BufferObjects, data: ArrayBufferView, usage: UsageType): void {
//     bufferData(target, changetype<i32>(data), usage);
//   }
//   vertexAttribPointer(index: i32, size: i32, type: DataType, normalized: boolean, stride: i32, offset: i32): void {
//     vertexAttribPointer(index, size, type, normalized, stride, offset);
//   }
//   vertexAttribIPointer(index: i32, size: i32, type: DataType, stride: i32, offset: i32): void {
//     vertexAttribIPointer(index, size, type, stride, offset);
//   }
//   disableVertexAttribArray(index: i32): void {
//     disableVertexAttribArray(index);
//   }
//   vertexAttrib1fv(index: i32, values: Float32Array): void {
//     vertexAttrib1fv(index, values);
//   }
//   vertexAttrib2fv(index: i32, values: Float32Array): void {
//     vertexAttrib2fv(index, values);
//   }
//   vertexAttrib3fv(index: i32, values: Float32Array): void {
//     vertexAttrib3fv(index, values);
//   }
//   vertexAttrib4fv(index: i32, values: Float32Array): void {
//     vertexAttrib4fv(index, values);
//   }
//   viewport(x: i32, y: i32, width: i32, height: i32): void {
//     viewport(x, y, width, height);
//   }
//   print(message: string): void {
//     print(message);
//   }
//   getTexureIndex(name: string): u32 {
//     return getTexureIndex(name);
//   }
//   getUniformLocation(shaderIndex: u32, name: string): u32 {
//     return getUniformLocation(shaderIndex, name);
//   }
//   renderQueue(commandsIndex: Array<i32>): void {
//     renderQueue(commandsIndex);
//   }
// }
