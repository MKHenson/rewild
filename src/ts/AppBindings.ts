import { GPUBufferUsageFlags } from "../common/GPUEnums";
import { GameManager } from "./core/GameManager";
import { ExportType } from "./core/WasmManager";

type Import = WebAssembly.Imports;
export const vaos: WebGLVertexArrayObject[] = [];
export const buffers: WebGLBuffer[] = [];
let wasmExports: ExportType;

export function bindExports(exports: ExportType) {
  wasmExports = exports;
}

export function createBindingsGPU(importObject: Import, gameManager: GameManager) {
  if (!importObject.env.memory) throw new Error("You need to set memory in your importObject");

  const binding = {
    print(stringIndex: number) {
      if (wasmExports) console.log(wasmExports.exports.__getString(stringIndex));
    },
    createBufferFromF32(data: number, usage: GPUBufferUsageFlags) {
      const buffer = wasmExports.exports.__getFloat32Array(data);
      return gameManager.createBufferF32(buffer, usage);
    },
    createIndexBuffer(data: number, usage: GPUBufferUsageFlags) {
      const buffer = wasmExports.exports.__getUint32Array(data);
      return gameManager.createIndexBuffer(buffer, usage);
    },
    render(commandsIndex: number) {
      const commandBuffer = wasmExports.exports.__getArray(commandsIndex) as Array<number>;
      gameManager.renderQueueManager.run(commandBuffer);
    },
  };

  importObject.Imports = binding;
}
