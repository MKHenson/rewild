import { wasm } from "./WasmManager";
import { Light } from "./Light";

export class DirectionalLight extends Light {
  constructor(name?: string) {
    super(wasm.createDiectionalLight(name || null), name);
  }
}
