import * as fs from "fs";
import * as loader from "@assemblyscript/loader/umd";
import type * as MyModule from "../build/types";

/* imports go here */
const imports = {};
const wasmModule = loader.instantiateSync<typeof MyModule>(
  fs.readFileSync(__dirname + "/../build/optimized.wasm"),
  imports
);

export const wasm = wasmModule.exports;
