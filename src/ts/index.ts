// import wasmFile from "../../build/untouched.wasm";
// import type * as MyModule from "../../build/types";
// import { ContextManager } from "./renderer/ContextManager";
// import { WasmController } from "./renderer/WasmController";
// import { createBindings, bindExports } from "./AppBindings";
// import loader, { ASUtil, ResultObject } from "@assemblyscript/loader";

// export type ExportType = ResultObject & { exports: ASUtil & typeof MyModule };

// // Linear memory
// const memory = new WebAssembly.Memory({ initial: 100 });
// const importObject: WebAssembly.Imports = {
//   env: {
//     memory: memory,
//     seed: Date.now,
//     abort: (...args: any[]) => {
//       console.log("abort");
//       console.log((importObject.env as any).getString(args[0]));
//     },
//     getString: (string_index: number) => {
//       const buffer = (importObject.env as any).memory.buffer;
//       const U32 = new Uint32Array(buffer);
//       const id_addr = string_index / 4 - 2;
//       const id = U32[id_addr];
//       if (id !== 0x01) throw Error(`not a string index=${string_index} id=${id}`);
//       const len = U32[id_addr + 1];
//       const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
//       return str;
//     },
//   },
// };

// const controller = new WasmController();
// const gl = new ContextManager("canvas", controller);
// createBindings(importObject, gl);

// async function loadWasmFile() {
//   let obj = await loader.instantiateStreaming<typeof MyModule>(fetch(wasmFile), importObject);

//   bindExports(obj);
//   controller.setExports(obj);
//   controller.init(gl.canvas.width, gl.canvas.height);
//   await gl.initialize();
// }

// loadWasmFile();
