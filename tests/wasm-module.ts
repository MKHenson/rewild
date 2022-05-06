import * as fs from "fs";
import * as loader from "@assemblyscript/loader";
import type * as MyModule from "../build/test-types";
import { WASI } from "wasi";

const wasi = new WASI();

const memory = new WebAssembly.Memory({ initial: 100 });
const importObject = {
  Imports: {
    // createBufferFromF32: (data: any, usage: any) => {},
    // createBuffer: (data: any, usage: any) => {},
    // createIndexBuffer: (data: any, usage: any) => {},
    // render: (commandsIndex: any) => {},
    // print: (message: string) => {},
    // onSignalReceived: (type: any, event: any) => {},
    // lock: () => {},
    // unlock: () => {},
  },
  wasi_snapshot_preview1: wasi.wasiImport,
  env: {
    memory: memory,
    seed: Date.now,
    abort: (...args: any[]) => {},
  },
};

/* imports go here */
const wasmBin = fs.readFileSync(__dirname + "/../build/optimized.wasm");

const wasmModule = loader.instantiateSync<typeof MyModule>(wasmBin, importObject);
// wasi.start(wasmModule);

export const wasm = wasmModule.exports;
