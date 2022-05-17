import { wasm } from "../core/WasmManager";

export class Object3D {
  transform: Number;

  constructor() {
    this.transform = wasm.createTransformNode();
  }

  set visibility(val: boolean) {
    wasm.setVisibility(this.transform as any, val);
  }

  get visibility() {
    return wasm.getVisibility(this.transform as any);
  }
}
