import * as fs from "fs";
import * as loader from "@assemblyscript/loader";
import type * as MyModule from "../build/types";

const memory = new WebAssembly.Memory({ initial: 100 });
const importObject = {
  env: {
    memory: memory,
    seed: Date.now,
    Imports: {},
    abort: (...args: any[]) => {},
    getString: (string_index: number) => {
      const buffer = (importObject.env as any).memory.buffer;
      const U32 = new Uint32Array(buffer);
      const id_addr = string_index / 4 - 2;
      const id = U32[id_addr];
      if (id !== 0x01) throw Error(`not a string index=${string_index} id=${id}`);
      const len = U32[id_addr + 1];
      const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
      return str;
    },
    module: {},
    createBufferFromF32: (data: any, usage: any) => {},
    createBuffer: (data: any, usage: any) => {},
    createIndexBuffer: (data: any, usage: any) => {},
    render: (commandsIndex: any) => {},
    print: (message: string) => {},
    onSignalReceived: (type: any, event: any) => {},
    lock: () => {},
    unlock: () => {},
  },
};

/* imports go here */
const imports = {};
const wasmBin = fs.readFileSync(__dirname + "/../build/optimized.wasm");

const wasmModule = loader.instantiateSync<typeof MyModule>(wasmBin, importObject);

export const wasm = wasmModule.exports;
