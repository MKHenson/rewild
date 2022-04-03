import type * as MyModule from "../../../build/types";
import wasmFile from "../../../build/untouched.wasm";
import loader, { ASUtil, ResultObject } from "@assemblyscript/loader";
import { IBindable } from "./IBindable";

export type IWasmExports = ASUtil & typeof MyModule;
export type ExportType = ResultObject & { exports: IWasmExports };

export class WasmManager {
  memory: WebAssembly.Memory;
  importObject: WebAssembly.Imports;
  exports: IWasmExports;

  wasmArrayBuffer: Uint32Array;
  wasmDataView: DataView;
  wasmMemoryBlock: ArrayBuffer;

  constructor() {}

  async load(bindables: IBindable[]) {
    // Creating WASM with Linear memory
    this.memory = new WebAssembly.Memory({ initial: 100 });
    this.importObject = {
      env: {
        memory: this.memory,
        seed: Date.now,
        abort: (...args: any[]) => {
          console.error((this.importObject.env as any).getString(args[0]));
          console.error((this.importObject.env as any).getString(args[1]));
        },
        getString: (string_index: number) => {
          const buffer = (this.importObject.env as any).memory.buffer;
          const U32 = new Uint32Array(buffer);
          const id_addr = string_index / 4 - 2;
          const id = U32[id_addr];
          if (id !== 0x01) throw Error(`not a string index=${string_index} id=${id}`);
          const len = U32[id_addr + 1];
          const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
          return str;
        },
      },
    };

    if (!this.importObject.env.memory) throw new Error("You need to set memory in your importObject");

    const bindings: any = {
      print: (stringIndex: number) => {
        if (this.exports) console.log(this.exports.__getString(stringIndex));
      },
    };

    for (const bindable of bindables) Object.assign(bindings, bindable.createBinding());

    this.importObject.Imports = bindings;

    const obj = await loader.instantiateStreaming<typeof MyModule>(fetch(wasmFile), this.importObject);
    this.exports = obj.exports;
    this.wasmMemoryBlock = obj.exports.memory!.buffer;
    this.wasmArrayBuffer = new Uint32Array(this.wasmMemoryBlock);
    this.wasmDataView = new DataView(this.exports.memory.buffer);
  }
}
