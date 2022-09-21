import { instantiate, __AdaptedExports } from "../../../build/release";
import wasmFile from "../../../build/release.wasm";
import { IBindable } from "./IBindable";

export type Wasm = typeof __AdaptedExports & {
  getFloat32Array: (pointer: Number) => Float32Array;
  getUint32Array: (pointer: Number) => Uint32Array;
  getInt32Array: (pointer: Number) => Int32Array;
};

export let wasmManager: WasmManager;
export let wasm: Wasm;

export class WasmManager {
  memory: WebAssembly.Memory;
  memoryU32: Uint32Array;

  exports: Wasm;

  wasmArrayBuffer: Uint32Array;
  wasmMemoryBlock: ArrayBuffer;

  constructor() {
    wasmManager = this;
  }

  private __liftTypedArray<T extends Float32Array | Int32Array | Int16Array | Uint32Array>(
    constructor: Float32ArrayConstructor | Uint32ArrayConstructor | Int32ArrayConstructor,
    pointer: number
  ): T {
    const memoryU32 = this.memoryU32;
    return new constructor(
      this.memory.buffer,
      memoryU32[(pointer + 4) >>> 2],
      memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
    ) as T;
  }

  async load(bindables: IBindable[]) {
    // Creating WASM with Linear memory
    this.memory = new WebAssembly.Memory({ initial: 10000 });
    this.memoryU32 = new Uint32Array(this.memory.buffer);

    const bindings: any = {};

    for (const bindable of bindables) Object.assign(bindings, bindable.createBinding());

    const obj = (await instantiate(await WebAssembly.compileStreaming(fetch(wasmFile)), {
      Imports: bindings,
      env: {
        memory: this.memory,
      },
    })) as Wasm;

    obj.getFloat32Array = (pointer) => this.__liftTypedArray(Float32Array, pointer.valueOf() >>> 0);
    obj.getUint32Array = (pointer) => this.__liftTypedArray(Uint32Array, pointer.valueOf() >>> 0);
    obj.getInt32Array = (pointer) => this.__liftTypedArray(Int32Array, pointer.valueOf() >>> 0);

    this.exports = obj;
    wasm = obj;

    this.wasmMemoryBlock = this.memory!.buffer;
    this.wasmArrayBuffer = new Uint32Array(this.wasmMemoryBlock);
  }
}
