import { BufferAttribute } from "./BufferAttribute";

export class GLBufferAttribute {
  buffer: i32; // WebGLBuffer;
  type: i32;
  itemSize: number;
  elementSize: u8;
  count: number;
  version: number;

  constructor(buffer: i32, type: i32, itemSize: i32, elementSize: u8, count: i32) {
    this.buffer = buffer;
    this.type = type;
    this.itemSize = itemSize;
    this.elementSize = elementSize;
    this.count = count;

    this.version = 0;
  }

  set needsUpdate(value: boolean) {
    if (value === true) this.version++;
  }

  setBuffer(buffer: i32): GLBufferAttribute {
    this.buffer = buffer;

    return this;
  }

  setType(type: i32, elementSize: i32): GLBufferAttribute {
    this.type = type;
    this.elementSize = elementSize;

    return this;
  }

  setItemSize(itemSize: i32): GLBufferAttribute {
    this.itemSize = itemSize;

    return this;
  }

  setCount(count: i32): GLBufferAttribute {
    this.count = count;

    return this;
  }
}
