import * as fs from "fs";
import { __AdaptedExports, instantiate } from "../../build/test";

const memory = new WebAssembly.Memory({ initial: 100 });
const importObject = {
  Imports: {
    performanceNow: () => performance.now(),
    nodeCallback: (
      nodeName: number,
      functionName: number,
      portalName: number
    ) => {
      console.log(
        `${wasm.readString(nodeName)}.${wasm.readString(
          functionName
        )}(${wasm.readString(portalName)})`
      );
    },
    setupLights: (numLights, config, scene, direction) => {},
    renderComponents: (camera, meshComponents) => {},
    createChunk: (terrain) => {},
    unlock: () => {},
    lock: () => {},
  },
  env: {
    memory: memory,
    seed: Date.now,
    abort: (...args: any[]) => {},
  },
};

/* imports go here */
const wasmBin = fs.readFileSync(__dirname + "/../../build/test.wasm");
type Wasm = typeof __AdaptedExports & {
  getLiveF32Array: (pointer: Number) => Float32Array;
  getLiveI32Array: (pointer: Number) => Int32Array;
  readString: (pointer: number) => string | null;
};

let wasm: Wasm;

function initGlobals() {
  global.Mathf = Math;
  global.f32 = { EPSILON: Number.EPSILON };
  global.i32 = { MAX_VALUE: Number.MAX_VALUE };
  global.unchecked = function (t) {
    return t;
  };
  global.u32 = function (t) {
    return t | 0;
  };
  global.i32 = function (t) {
    return t | 0;
  };
  global.f32 = function (t) {
    return t;
  };
}

export async function init(imports?: any) {
  initGlobals();

  const moduleFile: WebAssembly.Module = await WebAssembly.compile(wasmBin);
  wasm = (await instantiate(moduleFile, {
    ...importObject,
    Imports: { ...importObject.Imports, ...imports },
  })) as any;
  wasm.getLiveF32Array = (pointer) => {
    return __liftTypedArray(Float32Array, pointer.valueOf() >>> 0);
  };
  wasm.getLiveI32Array = (pointer) => {
    return __liftTypedArray(Int32Array, pointer.valueOf() >>> 0);
  };
  wasm.readString = (textPointer) => {
    return __liftString(textPointer >>> 0);
  };

  global.wasm = wasm;

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

function __liftString(pointer: number | null) {
  if (!pointer) return null;
  const end =
      (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
    memoryU16 = new Uint16Array(memory.buffer);
  let start = pointer >>> 1,
    string = "";
  while (end - start > 1024)
    string += String.fromCharCode(
      ...memoryU16.subarray(start, (start += 1024))
    );
  return string + String.fromCharCode(...memoryU16.subarray(start, end));
}

export { wasm };
