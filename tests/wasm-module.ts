import * as fs from "fs";
import { __AdaptedExports, instantiate } from "../build/test";
import { WASI } from "wasi";

const wasi = new WASI();

const memory = new WebAssembly.Memory({ initial: 100 });
const importObject = {
  Imports: {},
  wasi_snapshot_preview1: wasi.wasiImport,
  env: {
    memory: memory,
    seed: Date.now,
    abort: (...args: any[]) => {},
  },
};

/* imports go here */
const wasmBin = fs.readFileSync(__dirname + "/../build/test.wasm");
let wasm: typeof __AdaptedExports & {
  getLiveF32Array: (pointer: Number) => Float32Array;
  getLiveI32Array: (pointer: Number) => Int32Array;
};

export async function init() {
  const moduleFile: WebAssembly.Module = await WebAssembly.compile(wasmBin);
  wasm = (await instantiate(moduleFile, importObject)) as any;
  wasm.getLiveF32Array = (pointer) => {
    return __liftTypedArray(Float32Array, pointer.valueOf() >>> 0);
  };
  wasm.getLiveI32Array = (pointer) => {
    return __liftTypedArray(Int32Array, pointer.valueOf() >>> 0);
  };

  return wasm;
}

function __liftTypedArray<T extends Float32Array | Int32Array | Int16Array>(
  constructor: Float32ArrayConstructor | Int32ArrayConstructor,
  pointer: number
): T {
  if (!pointer) return null;
  const memoryU32 = new Uint32Array(memory.buffer);
  return new constructor(
    memory.buffer,
    memoryU32[(pointer + 4) >>> 2],
    memoryU32[(pointer + 8) >>> 2] / constructor.BYTES_PER_ELEMENT
  ) as T;
}

export { wasm };
