import { BufferObjects, DataType, ShaderConstants, UsageType } from "../common/GLEnums";

export interface IBridge {
  createVertexArray(): i32;
  bindVertexArray(index: i32): void;
  deleteVertexArray(index: i32): void;
  getParameterI32(param: ShaderConstants): i32;
  enableVertexAttribArray(index: i32): void;
  vertexAttribDivisor(index: i32, divisor: i32): void;
  createBuffer(): i32;
  deleteBuffer(index: i32): void;
  bufferSubData(type: BufferObjects, offset: i32, data: ArrayBufferView, srcOffset: i32, length: i32): void;
  bindBuffer(type: BufferObjects, index: i32): void;
  bufferData(target: BufferObjects, data: ArrayBufferView, usage: UsageType): void;
  vertexAttribPointer(index: i32, size: i32, type: DataType, normalized: boolean, stride: i32, offset: i32): void;
  vertexAttribIPointer(index: i32, size: i32, type: DataType, stride: i32, offset: i32): void;
  disableVertexAttribArray(index: i32): void;
  vertexAttrib1fv(index: i32, values: Float32Array): void;
  vertexAttrib2fv(index: i32, values: Float32Array): void;
  vertexAttrib3fv(index: i32, values: Float32Array): void;
  vertexAttrib4fv(index: i32, values: Float32Array): void;
  viewport(x: i32, y: i32, width: i32, height: i32): void;
  print(message: string): void;
  getTexureIndex(name: string): u32;
  getUniformLocation(shaderIndex: u32, name: string): u32;
  renderQueue(commandsIndex: Array<i32>): void;
}
