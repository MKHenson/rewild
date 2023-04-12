import { wasm } from "../core/WasmManager";
import { generateUUID } from "@rewild/common";

let objectId = 1;

export class Object3D {
  transform: Number;
  name: string;
  id: number;
  uuid: string = generateUUID();

  constructor(name?: string) {
    this.transform = 0;
    this.name = name || "";
    this.id = objectId++;
    this.transform = wasm.createTransformNode(this.name);
    wasm.setId(this.transform as any, this.id);
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
