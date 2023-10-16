import { wasm } from "./WasmManager";
import { Light } from "./Light";

export class AmbientLight extends Light {
  constructor(name?: string) {
    super(wasm.createAmbientLight(name || null), name);
  }
}
