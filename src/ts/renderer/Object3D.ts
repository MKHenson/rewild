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

  add(child: Object3D) {
    wasm.addChild(this.transform as any, child.transform as any);
  }

  remove(child: Object3D) {
    wasm.removeChild(this.transform as any, child.transform as any);
  }
}
